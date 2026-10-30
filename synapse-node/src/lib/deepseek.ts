import { env } from "./env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface DeepSeekUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface DeepSeekResult {
  parsed: Record<string, unknown>;
  content: string;
  usage: DeepSeekUsage;
  finishReason: string | null;
  model: string;
  systemFingerprint: string | null;
  httpStatus: number;
  attempts: number;
  latencyMs: number;
}

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public httpStatus: number | null,
    public attempts: number,
    public latencyMs: number,
  ) {
    super(message);
  }
}

class RetryableError extends Error {
  constructor(
    message: string,
    public httpStatus: number | null,
  ) {
    super(message);
  }
}

/** Statuses DeepSeek documents as transient (rate limit, server error, overload); 400/401/402/422 are not retried. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 16_000);
}

/** DeepSeek JSON mode can return blank content; anything that is not a JSON object counts as invalid. */
export function parseJsonObject(content: string): Record<string, unknown> | null {
  if (!content.trim()) return null;
  try {
    const v: unknown = JSON.parse(content);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type FetchLike = typeof fetch;

export async function chatJson(
  messages: ChatMessage[],
  opts: { fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void>; apiKey?: string } = {},
): Promise<DeepSeekResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const apiKey = opts.apiKey ?? env.deepseekApiKey;
  const started = Date.now();
  const body = JSON.stringify({
    model: env.deepseekModel,
    messages,
    response_format: { type: "json_object" },
    max_tokens: env.maxTokens,
    thinking: { type: env.deepseekThinking },
    stream: false,
  });

  let lastErr: RetryableError | null = null;
  for (let attempt = 0; attempt <= env.maxRetries; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt - 1));
    try {
      const res = await fetchImpl(`${env.deepseekBaseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(env.requestTimeoutMs),
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        const msg = `DeepSeek HTTP ${res.status}: ${text}`;
        if (isRetryableStatus(res.status)) throw new RetryableError(msg, res.status);
        throw new DeepSeekError(msg, res.status, attempt + 1, Date.now() - started);
      }
      const data = (await res.json()) as {
        model?: string;
        system_fingerprint?: string;
        usage?: DeepSeekUsage;
        choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
      };
      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? "";
      const parsed = parseJsonObject(content);
      if (!parsed) throw new RetryableError(`model returned non-JSON content (finish_reason=${choice?.finish_reason ?? "?"})`, res.status);
      return {
        parsed,
        content,
        usage: data.usage ?? {},
        finishReason: choice?.finish_reason ?? null,
        model: data.model ?? env.deepseekModel,
        systemFingerprint: data.system_fingerprint ?? null,
        httpStatus: res.status,
        attempts: attempt + 1,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      if (err instanceof DeepSeekError) throw err;
      lastErr = err instanceof RetryableError ? err : new RetryableError(`network: ${err instanceof Error ? err.message : String(err)}`, null);
    }
  }
  throw new DeepSeekError(lastErr?.message ?? "DeepSeek request failed", lastErr?.httpStatus ?? null, env.maxRetries + 1, Date.now() - started);
}
