import postgres from "postgres";
import { env, HttpError } from "./env";
import { SCHEMA_SQL } from "./schema-sql";

type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as {
  __omegaSql?: Sql;
  __omegaSchema?: Promise<void>;
};

export function hasDb(): boolean {
  return env.databaseUrl.length > 0;
}

export function sql(): Sql {
  if (!hasDb()) throw new HttpError(503, "DATABASE_URL is not configured");
  if (!globalForDb.__omegaSql) {
    const local = /@(localhost|127\.0\.0\.1|postgres)(:|\/)/.test(env.databaseUrl);
    globalForDb.__omegaSql = postgres(env.databaseUrl, {
      max: 5,
      prepare: false,
      idle_timeout: 20,
      ssl: local ? false : "require",
      onnotice: () => {},
    });
  }
  return globalForDb.__omegaSql;
}

export async function db(): Promise<Sql> {
  const s = sql();
  if (!globalForDb.__omegaSchema) {
    globalForDb.__omegaSchema = s.unsafe(SCHEMA_SQL).then(() => undefined);
    globalForDb.__omegaSchema.catch(() => {
      globalForDb.__omegaSchema = undefined;
    });
  }
  await globalForDb.__omegaSchema;
  return s;
}
