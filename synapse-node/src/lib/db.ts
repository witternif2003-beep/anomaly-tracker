import postgres from "postgres";
import { env, HttpError } from "./env";
import { SCHEMA_SQL } from "./schema-sql";

type Sql = postgres.Sql;

const g = globalThis as unknown as { __synSql?: Sql; __synSchema?: Promise<void> };

export function hasDb(): boolean {
  return env.databaseUrl.length > 0;
}

export function sql(): Sql {
  if (!hasDb()) throw new HttpError(503, "DATABASE_URL is not configured");
  if (!g.__synSql) {
    const local = /@(localhost|127\.0\.0\.1|postgres|db)(:|\/)/.test(env.databaseUrl);
    g.__synSql = postgres(env.databaseUrl, {
      max: 5,
      prepare: false,
      idle_timeout: 20,
      ssl: local ? false : "require",
      onnotice: () => {},
    });
  }
  return g.__synSql;
}

export async function db(): Promise<Sql> {
  const s = sql();
  if (!g.__synSchema) {
    g.__synSchema = s.unsafe(SCHEMA_SQL).then(() => undefined);
    g.__synSchema.catch(() => {
      g.__synSchema = undefined;
    });
  }
  await g.__synSchema;
  return s;
}
