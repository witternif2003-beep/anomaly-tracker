import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { chatJson, DeepSeekError, type ChatMessage, type DeepSeekResult } from "./deepseek";
import { env } from "./env";

type Sql = postgres.Sql;

/** Longer than one SSE function lifetime (maxDuration 300 s), so a killed function frees the lease. */
export const LEASE_SEC = 310;

export const SYSTEM_PROMPT = `You are a batch processor for an operator-supplied master prompt.
Each request is one batch. Reply with exactly one JSON object and nothing else.
Required keys: "codename" (short label for this batch, max 60 chars), "summary" (1-3 sentences),
"anomaly_score" (number 0-100, your own self-assessed score for how unusual this output is), "metrics" (object of key/value pairs).
Add any other keys the master prompt asks for. Do not present invented facts as verified; if the master prompt needs real-world data you do not have, say so in "summary".
EXAMPLE JSON OUTPUT:
{"codename":"BATCH-ALPHA","summary":"...","anomaly_score":12.5,"metrics":{"items":3}}`;

export interface PromptRow {
  id: string;
  prompt_text: string;
  instruction: string;
}

export function buildMessages(prompt: PromptRow, batchNumber: number, recentCodenames: string[]): ChatMessage[] {
  const recent = recentCodenames.length ? `\nCodenames already used (produce a new, different batch): ${recentCodenames.join(", ")}` : "";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Master Prompt: ${prompt.prompt_text}\nInstruction: ${prompt.instruction || "Produce the next batch."}\nBatch number: ${batchNumber}${recent}\nReturn json.`,
    },
  ];
}

export function clampScore(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(Math.max(-999.99, Math.min(999.99, n)) * 100) / 100;
}

export function codenameOf(parsed: Record<string, unknown>): string {
  const c = parsed.codename ?? parsed.target_codename ?? parsed.title;
  return typeof c === "string" && c.trim() ? c.trim().slice(0, 100) : "UNLABELLED";
}

/** Measured per-batch telemetry. Only values observed from the request/response are recorded. */
export function telemetryFor(r: DeepSeekResult | null, err: DeepSeekError | null): [string, string][] {
  const rows: [string, string | number | null | undefined][] = r
    ? [
        ["M01_latency_ms", r.latencyMs],
        ["M02_attempts", r.attempts],
        ["M03_http_status", r.httpStatus],
        ["M04_prompt_tokens", r.usage.prompt_tokens],
        ["M05_completion_tokens", r.usage.completion_tokens],
        ["M06_total_tokens", r.usage.total_tokens],
        ["M07_cache_hit_tokens", r.usage.prompt_cache_hit_tokens],
        ["M08_cache_miss_tokens", r.usage.prompt_cache_miss_tokens],
        ["M09_reasoning_tokens", r.usage.completion_tokens_details?.reasoning_tokens],
        ["M10_finish_reason", r.finishReason],
        ["M11_model_score", clampScore(r.parsed.anomaly_score)],
        ["M12_json_valid", "true"],
        ["M13_output_bytes", Buffer.byteLength(r.content, "utf8")],
        ["M14_output_keys", Object.keys(r.parsed).length],
        ["M15_model", r.model],
        ["M16_system_fingerprint", r.systemFingerprint],
      ]
    : [
        ["M01_latency_ms", err?.latencyMs],
        ["M02_attempts", err?.attempts],
        ["M03_http_status", err?.httpStatus],
        ["M12_json_valid", "false"],
        ["M17_error", err?.message],
      ];
  return rows.filter((x): x is [string, string | number] => x[1] !== null && x[1] !== undefined).map(([k, v]) => [k, String(v).slice(0, 255)]);
}

export async function acquireLease(sql: Sql, holder: string, seconds: number): Promise<boolean> {
  const rows = await sql`
    UPDATE synapse_engine_lease SET holder = ${holder}, lease_until = now() + make_interval(secs => ${seconds})
    WHERE id = 1 AND (lease_until < now() OR holder = ${holder})
    RETURNING id`;
  return rows.length === 1;
}

export async function releaseLease(sql: Sql, holder: string): Promise<void> {
  await sql`UPDATE synapse_engine_lease SET lease_until = 'epoch' WHERE id = 1 AND holder = ${holder}`;
}

export type TickResult =
  | { ran: true; promptId: string; batchNumber: number; status: "OK" | "ERROR"; batchId: string }
  | { ran: false; reason: string };

export async function tick(sql: Sql, opts: { promptId?: string; force?: boolean } = {}): Promise<TickResult> {
  if (!env.deepseekApiKey) return { ran: false, reason: "DEEPSEEK_API_KEY not configured" };
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM synapse_output_batches WHERE processed_at > now() - interval '24 hours'`;
  if (n >= env.dailyBatchCap) return { ran: false, reason: `daily batch cap reached (${env.dailyBatchCap}/24h)` };

  const interval = opts.force ? 0 : env.batchIntervalSec;
  const [prompt] = await sql<(PromptRow & { last_at: Date | null })[]>`
    SELECT p.id, p.prompt_text, p.instruction, max(b.processed_at) AS last_at
    FROM synapse_master_prompts p
    LEFT JOIN synapse_output_batches b ON b.master_prompt_id = p.id
    WHERE p.status = 'ACTIVE' ${opts.promptId ? sql`AND p.id = ${opts.promptId}` : sql``}
    GROUP BY p.id
    HAVING max(b.processed_at) IS NULL OR max(b.processed_at) < now() - make_interval(secs => ${interval})
    ORDER BY max(b.processed_at) ASC NULLS FIRST
    LIMIT 1`;
  if (!prompt) return { ran: false, reason: "no ACTIVE prompt is due" };

  const holder = randomUUID();
  if (!(await acquireLease(sql, holder, LEASE_SEC))) {
    return { ran: false, reason: "another batch is in progress" };
  }
  try {
    const recent = await sql<{ target_codename: string }[]>`
      SELECT target_codename FROM synapse_output_batches
      WHERE master_prompt_id = ${prompt.id} AND status = 'OK' ORDER BY seq DESC LIMIT 8`;
    const [{ next }] = await sql<{ next: number }[]>`
      SELECT coalesce(max(batch_number), 0) + 1 AS next FROM synapse_output_batches WHERE master_prompt_id = ${prompt.id}`;

    let result: DeepSeekResult | null = null;
    let failure: DeepSeekError | null = null;
    try {
      result = await chatJson(buildMessages(prompt, next, recent.map((r) => r.target_codename)));
    } catch (err) {
      failure = err instanceof DeepSeekError ? err : new DeepSeekError(String(err), null, 1, 0);
    }

    const batchId = randomUUID();
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO synapse_output_batches (id, master_prompt_id, batch_number, status, target_codename, raw_output, anomaly_score, error, model)
        VALUES (${batchId}, ${prompt.id}, ${next}, ${result ? "OK" : "ERROR"},
          ${result ? codenameOf(result.parsed) : null},
          ${result ? tx.json(result.parsed as postgres.JSONValue) : null},
          ${result ? clampScore(result.parsed.anomaly_score) : null},
          ${failure ? failure.message.slice(0, 1000) : null},
          ${result?.model ?? env.deepseekModel})`;
      const metrics = telemetryFor(result, failure);
      if (metrics.length) {
        await tx`INSERT INTO synapse_system_telemetry ${tx(metrics.map(([metric_key, metric_value]) => ({ batch_id: batchId, metric_key, metric_value })))}`;
      }
    });
    return { ran: true, promptId: prompt.id, batchNumber: next, status: result ? "OK" : "ERROR", batchId };
  } finally {
    await releaseLease(sql, holder);
  }
}
