import { db, hasDb } from "@/lib/db";
import { env } from "@/lib/env";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  let database: "ok" | "unconfigured" | "error" = hasDb() ? "ok" : "unconfigured";
  let activePrompts: number | null = null;
  let leaseHeldUntil: string | null = null;
  if (hasDb()) {
    try {
      const sql = await db();
      const [a] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM synapse_master_prompts WHERE status = 'ACTIVE'`;
      const [l] = await sql<{ lease_until: Date }[]>`SELECT lease_until FROM synapse_engine_lease WHERE id = 1`;
      activePrompts = a.n;
      leaseHeldUntil = l && l.lease_until.getTime() > Date.now() ? l.lease_until.toISOString() : null;
    } catch (err) {
      console.error(err);
      database = "error";
    }
  }
  return json({
    ok: database === "ok",
    database,
    deepseek: env.deepseekApiKey ? "configured" : "missing DEEPSEEK_API_KEY",
    model: env.deepseekModel,
    thinking: env.deepseekThinking,
    batchIntervalSec: env.batchIntervalSec,
    dailyBatchCap: env.dailyBatchCap,
    operatorAuth: env.operatorPassphrase.length >= 12 && env.sessionSecret.length >= 32 ? "configured" : "unconfigured",
    activePrompts,
    batchInProgressUntil: leaseHeldUntil,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    time: new Date().toISOString(),
  });
});
