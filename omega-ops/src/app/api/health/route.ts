import { db, hasDb } from "@/lib/db";
import { env } from "@/lib/env";
import { json } from "@/lib/http";
import { processMemory } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "not_configured" | "error" = "not_configured";
  let batches: number | null = null;
  if (hasDb()) {
    try {
      const s = await db();
      const [row] = await s<{ n: string }[]>`SELECT count(*) AS n FROM ops_batch`;
      batches = Number(row.n);
      database = "ok";
    } catch (e) {
      console.error("[health] database check failed:", e instanceof Error ? e.message : e);
      database = "error";
    }
  }
  return json({
    status: database === "error" ? "degraded" : "ok",
    database,
    batches,
    sessionSecret: env.sessionSecret.length >= 32 ? "configured" : "missing",
    operatorPassphrase: env.operatorPassphrase.length >= 12 ? "configured" : "missing",
    scheduler: env.cronSecret.length >= 16 ? "configured" : "missing",
    memory: processMemory(),
    time: new Date().toISOString(),
  });
}
