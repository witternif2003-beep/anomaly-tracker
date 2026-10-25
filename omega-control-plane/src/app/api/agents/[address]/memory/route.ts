import { normalizeAddress } from "@/lib/address";
import { getAgent, latestSnapshot } from "@/lib/agents";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/memory">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const snap = await latestSnapshot(sql, agent.address);
  const t = snap?.payload.tables ?? {};
  const a = snap?.payload.aggregates ?? {};
  return json({
    snapshotId: snap?.id ?? null,
    capturedAt: snap?.captured_at ?? null,
    source: "state.db tables event_stream, knowledge_store, working/episodic/semantic/procedural memory, session_summaries",
    eventTypeTotals: a.event_stream_by_type ?? [],
    memoryCounts: a.memory_counts ?? [],
    events: t.event_stream ?? [],
    knowledge: t.knowledge_store ?? [],
    workingMemory: t.working_memory ?? [],
    episodic: t.episodic_memory ?? [],
    sessionSummaries: t.session_summaries ?? [],
  });
});
