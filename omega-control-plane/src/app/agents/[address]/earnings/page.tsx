"use client";
import { useEffect } from "react";
import { Card, Empty, ErrorBox, RowsTable, SignedBars, Stat } from "@/components/ui";
import { usd, useApi, when } from "@/lib/client";
import { PAYOUT_WALLET } from "@/lib/payout";
import { useAgentAddress } from "../use-agent";

interface Window {
  label: string;
  days: number;
  observedDays: number;
  revenueCents: number;
  costCents: number;
  netCents: number;
  retention: number | null;
}
interface Earnings {
  capturedAt: string | null;
  method: string;
  targetUsdPerDay: number;
  windows: Window[];
  daily: { day: string; revenueCents: number; costCents: number; netCents: number; targetGapCents: number; metTarget: boolean }[];
  observedDays: number;
  daysMetTarget: number;
  sampleLabel: string;
  income: { at: string; amountCents: number; description: string }[];
  incomeBySource: { source: string; n: number; cents: number }[];
  payouts: { id: string; createdAt: string; status: string; amountUsd: number | null; txHash: string | null; explorer: string | null; reason: string | null }[];
  paidOutUsd: number;
  sources: { income: string; daily: string; payouts: string };
}

const tone = (c?: number | null) => (c == null ? undefined : c >= 0 ? ("good" as const) : ("bad" as const));
const pct = (r: number | null) => (r == null ? "—" : `${(r * 100).toFixed(1)}%`);

export default function EarningsPage() {
  const address = useAgentAddress();
  const { data, error, reload } = useApi<Earnings>(`/api/agents/${address}/earnings`);

  useEffect(() => {
    const es = new EventSource(`/api/agents/${address}/telemetry`);
    es.addEventListener("snapshot", () => reload());
    return () => es.close();
  }, [address, reload]);

  const targetCents = (data?.targetUsdPerDay ?? 0) * 100;
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {!data?.capturedAt ? (
        <Empty>No signed snapshots yet, so no earnings to show. Run omega-sync on the agent host (see Connect); this tab updates on each new snapshot.</Empty>
      ) : (
        <>
          <Card title="Realised earnings" source={`${data.sources.daily} · ${data.method} · snapshot ${when(data.capturedAt)}`}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
              {data.windows.map((w) => (
                <div key={w.label} className="rounded border border-line p-2">
                  <div className="text-[11px] text-dim">
                    {w.label} · {w.observedDays} day{w.observedDays === 1 ? "" : "s"} with records
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Stat label="Revenue" value={usd(w.revenueCents)} />
                    <Stat label="Net" value={usd(w.netCents)} tone={tone(w.netCents)} />
                    <Stat label="Costs" value={usd(w.costCents)} />
                    <Stat label="Kept" value={pct(w.retention)} hint="net ÷ revenue" tone={tone(w.retention)} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card
            title="Daily net vs operator target"
            source={`target ${usd(targetCents)}/day is the operator's goal (DAILY_TARGET_USD, src/lib/pnl.ts), not a forecast or guarantee · ${data.sources.daily}`}
            right={<span className={`font-mono text-xs ${data.sampleLabel.startsWith("statistically") ? "text-warn" : "text-good"}`}>{data.sampleLabel}</span>}
          >
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Days recorded" value={data.observedDays} hint="fewer than 30 = indistinguishable from noise" />
              <Stat label="Days at or above target" value={`${data.daysMetTarget} / ${data.observedDays}`} tone={data.daysMetTarget > 0 ? "good" : undefined} />
              <Stat label="Best day (net)" value={data.daily.length ? usd(Math.max(...data.daily.map((d) => d.netCents))) : "—"} />
              <Stat label="Latest day gap" value={data.daily.length ? usd(data.daily.at(-1)!.targetGapCents) : "—"} tone={tone(data.daily.at(-1)?.targetGapCents)} />
            </div>
            <SignedBars data={data.daily.slice(-30).reverse()} label="day" value="netCents" format={usd} />
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Income by source" source={`${data.sources.income}; grouped by the agent's own ledger description`}>
              <RowsTable rows={data.incomeBySource.map((s) => ({ source: s.source, transfers: s.n, total: usd(s.cents) }))} columns={["source", "transfers", "total"]} empty="No incoming transfers in this snapshot." />
            </Card>
            <Card title="Latest incoming transfers" source={data.sources.income}>
              <RowsTable rows={data.income.map((i) => ({ at: i.at, amount: usd(i.amountCents), description: i.description }))} columns={["at", "amount", "description"]} empty="No incoming transfers in this snapshot." />
            </Card>
          </div>
        </>
      )}
      <Card
        title="Payouts to the fixed payout wallet"
        source={data?.sources.payouts ?? "agent_commands type='payout'"}
        right={
          <a href={`https://basescan.org/address/${PAYOUT_WALLET}`} target="_blank" rel="noreferrer" className="break-all font-mono text-[11px] text-accent">
            {PAYOUT_WALLET}
          </a>
        }
      >
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat label="Paid out (confirmed on-chain)" value={data ? `$${data.paidOutUsd.toFixed(2)}` : "—"} hint="applied payouts with a tx hash" />
          <Stat label="Payout requests" value={data?.payouts.length ?? "—"} hint="request new payouts on the Treasury tab" />
        </div>
        {data?.payouts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-dim">
                <tr>
                  <th className="py-1 pr-3">requested</th>
                  <th className="py-1 pr-3">amount</th>
                  <th className="py-1 pr-3">status</th>
                  <th className="py-1">tx / reason</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-1 pr-3 whitespace-nowrap">{when(p.createdAt)}</td>
                    <td className="py-1 pr-3 font-mono">{p.amountUsd == null ? "—" : `$${p.amountUsd.toFixed(2)}`}</td>
                    <td className={`py-1 pr-3 ${p.status === "applied" ? "text-good" : p.status === "pending" || p.status === "delivered" ? "text-warn" : "text-bad"}`}>{p.status}</td>
                    <td className="py-1 break-all font-mono">
                      {p.explorer ? (
                        <a href={p.explorer} target="_blank" rel="noreferrer" className="text-accent">
                          {p.txHash!.slice(0, 10)}…
                        </a>
                      ) : (
                        (p.reason ?? "—")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No payout requests yet.</Empty>
        )}
      </Card>
    </div>
  );
}
