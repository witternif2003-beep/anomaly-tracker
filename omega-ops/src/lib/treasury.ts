import type postgres from "postgres";
import { HttpError } from "./env";

/**
 * Simulated treasury. Units are internal compute credits with no monetary value
 * and no external settlement; the ledger exists to enforce spending limits on
 * pipeline work.
 */
export const UNIT_LABEL = "compute units";

export interface Balance {
  allocated: number;
  spent: number;
  available: number;
  spentToday: number;
  batchMax: number;
  dailyMax: number;
  dailyRemaining: number;
}

export async function balance(sql: postgres.Sql): Promise<Balance> {
  const [tot] = await sql<{ allocated: string; spent: string; today: string }[]>`
    SELECT
      COALESCE(SUM(units) FILTER (WHERE kind = 'allocation'), 0) AS allocated,
      COALESCE(SUM(units) FILTER (WHERE kind = 'spend'), 0) AS spent,
      COALESCE(SUM(units) FILTER (WHERE kind = 'spend' AND at >= date_trunc('day', now())), 0) AS today
    FROM ops_treasury`;
  const limits = await sql<{ key: string; units: string }[]>`SELECT key, units FROM ops_limit`;
  const byKey = Object.fromEntries(limits.map((l) => [l.key, Number(l.units)]));
  const allocated = Number(tot?.allocated ?? 0);
  const spent = Number(tot?.spent ?? 0);
  const spentToday = Number(tot?.today ?? 0);
  const dailyMax = byKey.daily_max ?? 0;
  return {
    allocated,
    spent,
    available: allocated - spent,
    spentToday,
    batchMax: byKey.batch_max ?? 0,
    dailyMax,
    dailyRemaining: Math.max(0, dailyMax - spentToday),
  };
}

/** Throws when a run of `estimate` units would breach the per-batch, daily or balance limit. */
export async function assertWithinLimits(sql: postgres.Sql, estimate: number): Promise<Balance> {
  const b = await balance(sql);
  if (estimate > b.batchMax) throw new HttpError(429, `per-batch limit reached: ${estimate} > ${b.batchMax} ${UNIT_LABEL}`);
  if (estimate > b.dailyRemaining) throw new HttpError(429, `daily limit reached: ${b.spentToday} of ${b.dailyMax} ${UNIT_LABEL} already spent today`);
  if (estimate > b.available) throw new HttpError(429, `insufficient simulated balance: ${b.available} ${UNIT_LABEL} available`);
  return b;
}

export async function recordSpend(sql: postgres.Sql | postgres.TransactionSql, batchId: number | string, units: number, memo: string, actor: string): Promise<void> {
  await sql`INSERT INTO ops_treasury (batch_id, kind, units, memo, actor) VALUES (${batchId}, 'spend', ${units}, ${memo}, ${actor})`;
}

/** Units a batch costs: a fixed pipeline charge plus a charge per source megabyte read. */
export function costOf(sourceBytes: number): number {
  return Math.round((2 + sourceBytes / 1_048_576) * 100) / 100;
}
