export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  operatorPassphrase: process.env.OPERATOR_PASSPHRASE ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  nvdApiKey: process.env.NVD_API_KEY ?? "",
  nvdWindowHours: Number(process.env.NVD_WINDOW_HOURS ?? 24),
  batchMinIntervalSec: Number(process.env.BATCH_MIN_INTERVAL_SEC ?? 60),
  batchStaleMin: Number(process.env.BATCH_STALE_MIN ?? 30),
};

export function sessionSecret(): string {
  if (env.sessionSecret.length < 32) throw new HttpError(503, "SESSION_SECRET is not configured (min 32 chars)");
  return env.sessionSecret;
}
