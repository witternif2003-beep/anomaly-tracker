import type postgres from "postgres";
import { HttpError } from "./env";

type Sql = postgres.Sql;

export interface BatchView {
  seq: number;
  id: string;
  batch: number;
  promptId: string;
  status: "OK" | "ERROR";
  codename: string | null;
  score: number | null;
  error: string | null;
  model: string | null;
  processedAt: string;
  data: Record<string, unknown> | null;
  telemetry: Record<string, string>;
}

export interface PromptView {
  id: string;
  promptText: string;
  instruction: string;
  status: string;
  createdBy: string;
  createdAt: string;
  batches: number;
  errors: number;
  lastAt: string | null;
}

interface BatchRow {
  seq: string;
  id: string;
  batch_number: number;
  master_prompt_id: string;
  status: "OK" | "ERROR";
  target_codename: string | null;
  anomaly_score: string | null;
  error: string | null;
  model: string | null;
  processed_at: Date;
  raw_output: Record<string, unknown> | null;
  telemetry: Record<string, string> | null;
}

function toView(r: BatchRow): BatchView {
  return {
    seq: Number(r.seq),
    id: r.id,
    batch: r.batch_number,
    promptId: r.master_prompt_id,
    status: r.status,
    codename: r.target_codename,
    score: r.anomaly_score === null ? null : Number(r.anomaly_score),
    error: r.error,
    model: r.model,
    processedAt: r.processed_at.toISOString(),
    data: r.raw_output,
    telemetry: r.telemetry ?? {},
  };
}

/** Batches with seq > afterSeq, oldest first (for streaming), or the newest `limit` when afterSeq is null. */
export async function listBatches(sql: Sql, opts: { promptId?: string | null; afterSeq?: number | null; limit?: number }): Promise<BatchView[]> {
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 500);
  const where = sql`WHERE true
    ${opts.promptId ? sql`AND b.master_prompt_id = ${opts.promptId}` : sql``}
    ${opts.afterSeq != null ? sql`AND b.seq > ${opts.afterSeq}` : sql``}`;
  const rows = await sql<BatchRow[]>`
    SELECT b.seq, b.id, b.batch_number, b.master_prompt_id, b.status, b.target_codename, b.anomaly_score, b.error, b.model, b.processed_at, b.raw_output,
      (SELECT jsonb_object_agg(t.metric_key, t.metric_value) FROM synapse_system_telemetry t WHERE t.batch_id = b.id) AS telemetry
    FROM synapse_output_batches b ${where}
    ORDER BY b.seq ${opts.afterSeq != null ? sql`ASC` : sql`DESC`}
    LIMIT ${limit}`;
  return rows.map(toView);
}

export async function listPrompts(sql: Sql): Promise<PromptView[]> {
  const rows = await sql<
    { id: string; prompt_text: string; instruction: string; status: string; created_by: string; created_at: Date; batches: number; errors: number; last_at: Date | null }[]
  >`
    SELECT p.id, p.prompt_text, p.instruction, p.status, p.created_by, p.created_at,
      count(b.id)::int AS batches, count(b.id) FILTER (WHERE b.status = 'ERROR')::int AS errors, max(b.processed_at) AS last_at
    FROM synapse_master_prompts p LEFT JOIN synapse_output_batches b ON b.master_prompt_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC LIMIT 100`;
  return rows.map((r) => ({
    id: r.id,
    promptText: r.prompt_text,
    instruction: r.instruction,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    batches: r.batches,
    errors: r.errors,
    lastAt: r.last_at?.toISOString() ?? null,
  }));
}

export interface TelemetrySummary {
  batches: number;
  ok: number;
  errors: number;
  jsonValidRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  avgAttempts: number | null;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  last24h: number;
}

export async function telemetrySummary(sql: Sql, promptId?: string | null): Promise<TelemetrySummary> {
  const scope = promptId ? sql`AND b.master_prompt_id = ${promptId}` : sql``;
  const [r] = await sql<
    {
      batches: number;
      ok: number;
      errors: number;
      p50: number | null;
      p95: number | null;
      attempts: number | null;
      prompt_tokens: number;
      completion_tokens: number;
      cache_hit: number;
      last24h: number;
    }[]
  >`
    WITH m AS (
      SELECT b.id, b.status, b.processed_at,
        max(t.metric_value) FILTER (WHERE t.metric_key = 'M01_latency_ms')::numeric AS latency,
        max(t.metric_value) FILTER (WHERE t.metric_key = 'M02_attempts')::numeric AS attempts,
        max(t.metric_value) FILTER (WHERE t.metric_key = 'M04_prompt_tokens')::numeric AS pt,
        max(t.metric_value) FILTER (WHERE t.metric_key = 'M05_completion_tokens')::numeric AS ct,
        max(t.metric_value) FILTER (WHERE t.metric_key = 'M07_cache_hit_tokens')::numeric AS ch
      FROM synapse_output_batches b LEFT JOIN synapse_system_telemetry t ON t.batch_id = b.id
      WHERE true ${scope}
      GROUP BY b.id
    )
    SELECT count(*)::int AS batches,
      count(*) FILTER (WHERE status = 'OK')::int AS ok,
      count(*) FILTER (WHERE status = 'ERROR')::int AS errors,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY latency) FILTER (WHERE status = 'OK')::float AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY latency) FILTER (WHERE status = 'OK')::float AS p95,
      avg(attempts)::float AS attempts,
      coalesce(sum(pt), 0)::float AS prompt_tokens,
      coalesce(sum(ct), 0)::float AS completion_tokens,
      coalesce(sum(ch), 0)::float AS cache_hit,
      count(*) FILTER (WHERE processed_at > now() - interval '24 hours')::int AS last24h
    FROM m`;
  return {
    batches: r.batches,
    ok: r.ok,
    errors: r.errors,
    jsonValidRate: r.batches ? r.ok / r.batches : null,
    latencyP50Ms: r.p50,
    latencyP95Ms: r.p95,
    avgAttempts: r.attempts,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    cacheHitTokens: r.cache_hit,
    last24h: r.last24h,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function promptIdParam(v: string | null | undefined): string | null {
  if (!v || v === "all") return null;
  if (!UUID.test(v)) throw new HttpError(400, "invalid prompt id");
  return v.toLowerCase();
}
