import { normalizeAddress } from "@/lib/address";
import { getAgent, getPolicy, latestSnapshot } from "@/lib/agents";
import { readOnchain } from "@/lib/chain";
import { db, hasDb } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/status">) => {
  const address = normalizeAddress((await ctx.params).address);
  if (!hasDb()) {
    return json({ address, registered: false, database: "not_configured", onchain: await readOnchain(address) });
  }
  const sql = await db();
  const agent = await getAgent(sql, address);
  const snap = await latestSnapshot(sql, address);
  const agentId = (snap?.payload.tables.registry?.[0]?.agent_id as string | undefined) ?? null;
  const [onchain, policy] = await Promise.all([readOnchain(address, agentId), getPolicy(sql, address)]);
  const p = snap?.payload;
  return json({
    address,
    registered: true,
    agent,
    snapshot: snap
      ? {
          id: snap.id,
          capturedAt: snap.captured_at,
          receivedAt: snap.received_at,
          payloadSha256: snap.payload_sha256,
          signature: snap.signature,
          survivalTier: snap.survival_tier,
          creditsCents: snap.credits_cents == null ? null : Number(snap.credits_cents),
          creditsSource: p?.creditsSource,
          agentState: p?.agentState,
          turnCount: p?.turnCount,
          config: p?.config,
          source: p?.source,
          kv: p?.kv,
          missingTables: p?.missingTables,
          heartbeatSchedule: p?.tables.heartbeat_schedule ?? [],
          heartbeatHistory: p?.tables.heartbeat_history ?? [],
          children: p?.tables.children ?? [],
          registry: p?.tables.registry ?? [],
          reputation: p?.tables.reputation ?? [],
          recentTurns: p?.tables.turns ?? [],
          recentToolCalls: p?.tables.tool_calls ?? [],
          policyDecisions: p?.tables.policy_decisions ?? [],
        }
      : null,
    policy,
    onchain,
  });
});
