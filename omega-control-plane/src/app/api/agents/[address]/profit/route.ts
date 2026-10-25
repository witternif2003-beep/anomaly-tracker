import { normalizeAddress } from "@/lib/address";
import { getAgent, latestSnapshot } from "@/lib/agents";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { dailyPnl, PNL_METHOD, pnlFromAggregates } from "@/lib/pnl";
import { validateTrackRecord } from "@/lib/stats";

type Row = Record<string, unknown>;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/profit">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const snap = await latestSnapshot(sql, agent.address);
  const rows = await sql<{ id: string; captured_at: Date; credits_cents: string | null; turn_count: string | null; tx: Row[] | null; inf: Row[] | null }[]>`
    SELECT id, captured_at, credits_cents, turn_count,
           payload->'aggregates'->'transactions_by_type' AS tx,
           payload->'aggregates'->'inference_totals' AS inf
    FROM snapshots WHERE agent_address = ${agent.address} ORDER BY id DESC LIMIT 500`;
  const series = rows
    .map((r) => ({
      snapshotId: r.id,
      capturedAt: new Date(r.captured_at).toISOString(),
      creditsCents: r.credits_cents == null ? null : Number(r.credits_cents),
      turns: r.turn_count == null ? null : Number(r.turn_count),
      ...pnlFromAggregates(r.tx, r.inf?.[0]),
    }))
    .reverse();

  const latest = series.at(-1) ?? null;
  let window: Record<string, number | string | null> | null = null;
  if (latest) {
    const t1 = Date.parse(latest.capturedAt);
    const base = [...series].reverse().find((s) => Date.parse(s.capturedAt) <= t1 - 86_400_000) ?? series[0];
    const hours = (t1 - Date.parse(base.capturedAt)) / 3_600_000;
    const dNet = latest.netCents - base.netCents;
    const dCost = latest.costCents - base.costCents;
    const dRev = latest.revenueCents - base.revenueCents;
    const burn = hours > 0 ? dCost / hours : null;
    window = {
      from: base.capturedAt,
      to: latest.capturedAt,
      hours,
      netCents: dNet,
      revenueCents: dRev,
      costCents: dCost,
      netCentsPerHour: hours > 0 ? dNet / hours : null,
      burnCentsPerHour: burn,
      runwayHours: burn && burn > 0 && latest.creditsCents != null ? latest.creditsCents / burn : null,
    };
  }

  const txByDay = snap?.payload.aggregates.transactions_by_day as Row[] | undefined;
  const infByDay = (snap?.payload.aggregates.inference_by_day ?? []) as Row[];
  const daily = txByDay ? dailyPnl(txByDay, infByDay) : [];
  const validation = validateTrackRecord(daily.map((d) => d.netCents / 100));

  return json({
    snapshotId: snap?.id ?? null,
    capturedAt: snap?.captured_at ?? null,
    method: PNL_METHOD,
    sources: ["control-plane snapshots (agent-signed, latest 500)", "state.db transactions + inference_costs aggregates in the latest snapshot"],
    latest,
    window,
    series,
    daily,
    dailySource: txByDay
      ? "state.db transactions GROUP BY day, type + inference_costs GROUP BY day (latest snapshot)"
      : "unavailable: latest snapshot has no transactions_by_day aggregate (re-sync with the current omega-sync)",
    validation,
  });
});
