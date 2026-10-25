import { db, hasDb } from "@/lib/db";
import { env } from "@/lib/env";
import { json } from "@/lib/http";

export async function GET() {
  let database: "ok" | "not_configured" | "error" = "not_configured";
  if (hasDb()) {
    try {
      const s = await db();
      await s`SELECT 1`;
      database = "ok";
    } catch (e) {
      console.error("[health] database check failed:", e instanceof Error ? e.message : e);
      database = "error";
    }
  }
  return json({
    status: database === "error" ? "degraded" : "ok",
    database,
    sessionSecret: env.sessionSecret.length >= 32 ? "configured" : "missing",
    baseRpc: new URL(env.baseRpcUrl).host,
    time: new Date().toISOString(),
  });
}
