type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export const REVENUE_TYPES = new Set(["transfer_in"]);
export const FUNDING_TYPES = new Set(["credit_purchase", "topup"]);
export const COST_TYPES = new Set(["inference", "x402_payment", "transfer_out"]);

export const PNL_METHOD =
  "revenue = sum(transactions.type='transfer_in'); cost = max(sum of inference/x402_payment/transfer_out ledger rows, sum(inference_costs.cost_cents)); funding (topups, credit purchases) is shown separately and is not revenue.";

const sumTypes = (rows: Row[], set: Set<string>) => rows.filter((r) => set.has(String(r.type))).reduce((s, r) => s + Math.abs(num(r.total_cents)), 0);

/** Realised P&L from one snapshot's aggregates (transactions_by_type, inference_totals). */
export function pnlFromAggregates(txTotals: Row[] | null | undefined, inferenceTotals: Row | null | undefined) {
  const tx = txTotals ?? [];
  const revenueCents = sumTypes(tx, REVENUE_TYPES);
  const fundingCents = sumTypes(tx, FUNDING_TYPES);
  const ledgerCostCents = sumTypes(tx, COST_TYPES);
  const inferenceCostCents = num(inferenceTotals?.cost_cents);
  const costCents = Math.max(ledgerCostCents, inferenceCostCents);
  return { revenueCents, costCents, netCents: revenueCents - costCents, fundingCents, ledgerCostCents, inferenceCostCents };
}

export interface DailyPnl {
  day: string;
  revenueCents: number;
  costCents: number;
  netCents: number;
}

/** Per-day realised P&L from transactions_by_day (day,type,total_cents) and inference_by_day (day,cost_cents), oldest first. */
export function dailyPnl(txByDay: Row[], inferenceByDay: Row[]): DailyPnl[] {
  const days = new Map<string, { tx: Row[]; inf: number }>();
  const get = (d: string) => days.get(d) ?? days.set(d, { tx: [], inf: 0 }).get(d)!;
  for (const r of txByDay) if (r.day) get(String(r.day)).tx.push(r);
  for (const r of inferenceByDay) if (r.day) get(String(r.day)).inf += num(r.cost_cents);
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, { tx, inf }]) => {
      const p = pnlFromAggregates(tx, { cost_cents: inf });
      return { day, revenueCents: p.revenueCents, costCents: p.costCents, netCents: p.netCents };
    });
}

/** Operator-set goal shown for comparison only. It is a target, not a forecast or a guarantee. */
export const DAILY_TARGET_USD = 7000;
