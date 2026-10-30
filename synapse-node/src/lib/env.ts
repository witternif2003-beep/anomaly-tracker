export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  operatorPassphrase: process.env.OPERATOR_PASSPHRASE ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, ""),
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
  deepseekThinking: process.env.DEEPSEEK_THINKING === "enabled" ? "enabled" : "disabled",
  maxTokens: num("DEEPSEEK_MAX_TOKENS", 2048),
  requestTimeoutMs: num("DEEPSEEK_TIMEOUT_MS", 60_000),
  maxRetries: num("DEEPSEEK_MAX_RETRIES", 3),
  batchIntervalSec: num("BATCH_INTERVAL_SEC", 60),
  dailyBatchCap: num("DAILY_BATCH_CAP", 500),
};

export function sessionSecret(): string {
  if (env.sessionSecret.length < 32) throw new HttpError(503, "SESSION_SECRET is not configured (min 32 chars)");
  return env.sessionSecret;
}
