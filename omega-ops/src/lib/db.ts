import postgres from "postgres";
import { env, HttpError } from "./env";
import { SCHEMA_SQL } from "./schema-sql";

type Sql = postgres.Sql;

const g = globalThis as unknown as { __opsSql?: Sql; __opsSchema?: Promise<void> };

export function hasDb(): boolean {
  return env.databaseUrl.length > 0;
}

export function sql(): Sql {
  if (!hasDb()) throw new HttpError(503, "DATABASE_URL is not configured");
  if (!g.__opsSql) {
    const local = /@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(env.databaseUrl);
    g.__opsSql = postgres(env.databaseUrl, {
      max: 5,
      prepare: false,
      idle_timeout: 20,
      ssl: local ? false : "require",
      onnotice: () => {},
    });
  }
  return g.__opsSql;
}

export async function db(): Promise<Sql> {
  const s = sql();
  if (!g.__opsSchema) {
    g.__opsSchema = s.unsafe(SCHEMA_SQL).then(() => undefined);
    g.__opsSchema.catch(() => {
      g.__opsSchema = undefined;
    });
  }
  await g.__opsSchema;
  return s;
}
