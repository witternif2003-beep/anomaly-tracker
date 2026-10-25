import { normalizeAddress } from "@/lib/address";
import { getAgent, latestSnapshot } from "@/lib/agents";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/orchestration">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const snap = await latestSnapshot(sql, agent.address);
  const t = snap?.payload.tables ?? {};
  let lastTick: unknown = null;
  try {
    lastTick = snap?.payload.kv?.["orchestrator.last_tick"] ? JSON.parse(snap.payload.kv["orchestrator.last_tick"]) : null;
  } catch {
    lastTick = snap?.payload.kv?.["orchestrator.last_tick"] ?? null;
  }
  return json({
    snapshotId: snap?.id ?? null,
    capturedAt: snap?.captured_at ?? null,
    source: "state.db tables goals, task_graph; kv orchestrator.last_tick",
    goals: t.goals ?? [],
    tasks: t.task_graph ?? [],
    lastTick,
  });
});
