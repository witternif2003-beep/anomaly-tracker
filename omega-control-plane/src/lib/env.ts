export const env = {
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  baseRpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
  conwayApiUrl: process.env.CONWAY_API_URL ?? "https://api.conway.tech",
  maxSnapshotAgeSec: Number(process.env.MAX_SNAPSHOT_AGE_SEC ?? 600),
};

export function sessionSecret(): string {
  if (env.sessionSecret.length < 32) {
    throw new HttpError(503, "SESSION_SECRET is not configured (min 32 chars)");
  }
  return env.sessionSecret;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
