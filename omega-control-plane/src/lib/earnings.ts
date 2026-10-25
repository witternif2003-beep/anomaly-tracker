import type postgres from "postgres";
import type { AgentRow } from "./agents";
import { latestSnapshot } from "./agents";
import { dailyPnl, DAILY_TARGET_USD, PNL_METHOD, type DailyPnl } from "./pnl";

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const DAY_MS = 86_400_000;

export const MIN_DAYS_FOR_INFERENCE = 30;

export interface EarningsWindow {
  label: string;
  days: number;
  observedDays: number;
  revenueCents: number;
  costCents: number;
  netCents: number;
  /** net ÷ revenue; null when there is no revenue. */
  retention: number | null;
}

/** Pure earnings view from one signed snapshot's ledger rows and daily aggregates. */
export function earningsFromLedger(txRows: Row[], txByDay: Row[], infByDay: Row[], asOf: Date) {
  const daily: (DailyPnl & { targetGapCents: number; metTarget: boolean })[] = dailyPnl(txByDay, infByDay).map((d) => ({
    ...d,
    targetGapCents: d.netCents - DAILY_TARGET_USD * 100,
    metTarget: d.netCents >= DAILY_TARGET_USD * 100,
  }));
  const asOfDay = asOf.toISOString().slice(0, 10);
  const windowOf = (label: string, days: number | null): EarningsWindow => {
    const from = days == null ? "" : new Date(Date.parse(asOfDay) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
    const rows = daily.filter((d) => d.day >= from && d.day <= asOfDay);
    const revenueCents = rows.reduce((s, d) => s + d.revenueCents, 0);
    const costCents = rows.reduce((s, d) => s + d.costCents, 0);
    const netCents = revenueCents - costCents;
    return { label, days: days ?? rows.length, observedDays: rows.length, revenueCents, costCents, netCents, retention: revenueCents > 0 ? netCents / revenueCents : null };
  };
  const income = txRows
    .filter((r) => r.type === "transfer_in")
    .map((r) => ({ at: String(r.created_at ?? ""), amountCents: Math.abs(num(r.amount_cents)), description: String(r.description ?? "").trim() }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const bySource = new Map<string, { source: string; n: number; cents: number }>();
  for (const i of income) {
    const key = i.description.slice(0, 80) || "(no description)";
    const s = bySource.get(key) ?? { source: key, n: 0, cents: 0 };
    s.n += 1;
    s.cents += i.amountCents;
    bySource.set(key, s);
  }
  return {
    windows: [windowOf("Today (UTC)", 1), windowOf("Last 7 days", 7), windowOf("Last 30 days", 30), windowOf("All recorded days", null)],
    daily,
    observedDays: daily.length,
    daysMetTarget: daily.filter((d) => d.metTarget).length,
    sampleLabel: daily.length < MIN_DAYS_FOR_INFERENCE ? "statistically_indistinguishable_from_noise" : "sufficient_days_for_inference",
    income: income.slice(0, 50),
    incomeBySource: [...bySource.values()].sort((a, b) => b.cents - a.cents),
  };
}

export interface PayoutRow {
  id: string;
  createdAt: string;
  status: string;
  amountUsd: number | null;
  txHash: string | null;
  explorer: string | null;
  reason: string | null;
}

/** Earnings tab: realised income from the latest signed snapshot plus creator-signed payouts and their on-chain receipts. */
export async function computeEarnings(sql: postgres.Sql, agent: Pick<AgentRow, "address">) {
  const snap = await latestSnapshot(sql, agent.address);
  const agg = snap?.payload.aggregates ?? {};
  const tables = (snap?.payload.tables ?? {}) as Record<string, Row[] | undefined>;
  const view = earningsFromLedger(tables.transactions ?? [], (agg.transactions_by_day ?? []) as Row[], (agg.inference_by_day ?? []) as Row[], snap ? new Date(snap.captured_at) : new Date());
  const cmds = await sql<{ id: string; created_at: Date; status: string; payload: Row; result: Row | null }[]>`
    SELECT id, created_at, status, payload, result FROM agent_commands
    WHERE agent_address = ${agent.address} AND type = 'payout' ORDER BY id DESC LIMIT 100`;
  const payouts: PayoutRow[] = cmds.map((c) => {
    const hash = typeof c.result?.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(c.result.txHash) ? c.result.txHash : null;
    return {
      id: String(c.id),
      createdAt: new Date(c.created_at).toISOString(),
      status: c.status,
      amountUsd: typeof c.payload?.amountUsd === "number" ? c.payload.amountUsd : null,
      txHash: hash,
      explorer: hash ? `https://basescan.org/tx/${hash}` : null,
      reason: (c.result?.reason ?? c.result?.error ?? null) as string | null,
    };
  });
  const paidOutUsd = payouts.filter((p) => p.status === "applied" && p.txHash).reduce((s, p) => s + (p.amountUsd ?? 0), 0);
  return {
    snapshotId: snap?.id ?? null,
    capturedAt: snap?.captured_at ?? null,
    method: PNL_METHOD,
    targetUsdPerDay: DAILY_TARGET_USD,
    ...view,
    payouts,
    paidOutUsd,
    sources: {
      income: "state.db transactions (type='transfer_in') in the latest agent-signed snapshot (latest rows only)",
      daily: "state.db transactions_by_day + inference_by_day aggregates (agent-signed)",
      payouts: "agent_commands type='payout'; paid = status 'applied' with an on-chain tx hash from the agent's signed ack",
    },
  };
}
