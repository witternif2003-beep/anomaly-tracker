import { normalizeAddress } from "@/lib/address";
import { getAgent, getPolicy, latestSnapshot } from "@/lib/agents";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { PNL_METHOD, pnlFromAggregates } from "@/lib/pnl";

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);


export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/economics">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const [snap, policy] = await Promise.all([latestSnapshot(sql, agent.address), getPolicy(sql, agent.address)]);
  const tx = (snap?.payload.tables.transactions ?? []) as Row[];
  const byModel = (snap?.payload.aggregates.inference_by_model ?? []) as Row[];
  const byDay = (snap?.payload.aggregates.inference_by_day ?? []) as Row[];
  const totals = (snap?.payload.aggregates.inference_totals ?? [])[0] as Row | undefined;
  const txTotals = (snap?.payload.aggregates.transactions_by_type ?? []) as Row[];

  const { revenueCents, fundingCents, ledgerCostCents, inferenceCostCents, costCents } = pnlFromAggregates(txTotals, totals);
  const turns = snap?.payload.turnCount ?? 0;

  const history = await sql`
    SELECT id, captured_at, credits_cents, survival_tier, turn_count FROM snapshots
    WHERE agent_address = ${agent.address} ORDER BY id DESC LIMIT 200`;
  const topups = await sql`
    SELECT id, status, payload, result, created_by, created_at, updated_at FROM agent_commands
    WHERE agent_address = ${agent.address} AND type = 'topup' ORDER BY id DESC LIMIT 50`;

  return json({
    snapshotId: snap?.id ?? null,
    capturedAt: snap?.captured_at ?? null,
    method: PNL_METHOD,
    sources: ["state.db transactions (aggregated)", "state.db inference_costs (aggregated)", "control-plane snapshots + agent_commands"],
    pnl: {
      revenueCents,
      costCents,
      netCents: revenueCents - costCents,
      fundingCents,
      inferenceCostCents,
      ledgerCostCents,
      turns,
      costPerTurnCents: turns > 0 ? costCents / turns : null,
      inferenceCalls: num(totals?.calls),
      inputTokens: num(totals?.input_tokens),
      outputTokens: num(totals?.output_tokens),
    },
    transactionsByType: txTotals,
    inferenceByModel: byModel,
    inferenceByDay: byDay,
    recentTransactions: tx.slice(0, 100),
    creditHistory: history,
    topups,
    policy,
  });
});
