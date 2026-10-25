"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, Empty, ErrorBox, RowsTable, SignedBars, Sparkline, Stat } from "@/components/ui";
import { usd, useApi, when } from "@/lib/client";
import { DAILY_TARGET_USD } from "@/lib/pnl";
import type { Gate } from "@/lib/stats";
import { useAgentAddress } from "../use-agent";

interface Point {
  snapshotId: string;
  capturedAt: string;
  creditsCents: number | null;
  revenueCents: number;
  costCents: number;
  netCents: number;
}
interface Profit {
  method: string;
  capturedAt: string | null;
  latest: Point | null;
  window: { from: string; to: string; hours: number; netCents: number; revenueCents: number; costCents: number; netCentsPerHour: number | null; burnCentsPerHour: number | null; runwayHours: number | null } | null;
  series: Point[];
  daily: { day: string; revenueCents: number; costCents: number; netCents: number }[];
  dailySource: string;
  validation: { n: number; sharpeDaily: number | null; psr: number | null; psrUncapped: number | null; dsr: number | null; minTrl: number | null; gates: Gate[]; gateStatus: string; label: string; moments: { mean: number; sd: number; skew: number; kurtosis: number } | null };
}

const tone = (c?: number | null) => (c == null ? undefined : c >= 0 ? ("good" as const) : ("bad" as const));
const GATE_TONE: Record<string, string> = { PASS: "text-good", REJECT: "text-bad", NOT_COMPUTABLE: "text-warn" };
/** With zero observations nothing has failed yet: show every non-pass gate neutral instead of as an error. */
const gateTone = (status: string, n: number) => (status !== "PASS" && n === 0 ? "text-dim" : GATE_TONE[status]);

export default function ProfitLive() {
  const address = useAgentAddress();
  const { data, error, reload } = useApi<Profit>(`/api/agents/${address}/profit`);
  const [conn, setConn] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/agents/${address}/telemetry`);
    es.addEventListener("hello", () => setConn("live"));
    es.addEventListener("ping", (e) => {
      setConn("live");
      setLastEvent(JSON.parse((e as MessageEvent).data).at);
    });
    es.addEventListener("snapshot", () => {
      setConn("live");
      setLastEvent(new Date().toISOString());
      reload();
    });
    es.onerror = () => setConn("reconnecting");
    return () => es.close();
  }, [address, reload]);

  const w = data?.window;
  const v = data?.validation;
  const per24 = w?.netCentsPerHour == null ? null : w.netCentsPerHour * 24;
  const targetCents = DAILY_TARGET_USD * 100;
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
        <span className={`rounded border px-2 py-0.5 font-mono ${conn === "live" ? "border-good/50 text-good" : "border-warn/50 text-warn"}`}>● {conn}</span>
        <span>
          Refreshes on every new agent-signed snapshot (server-sent events, checked every 5 s). Last snapshot {when(data?.capturedAt)}, last server event {when(lastEvent)}.
        </span>
      </div>
      {!data?.latest ? (
        <Empty>No signed snapshots yet. Run omega-sync on the agent host (see Connect) and this page updates live.</Empty>
      ) : (
        <>
          <Card title="Realised P&L — live" source={data.method}>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="Net (all time)" value={usd(data.latest.netCents)} tone={tone(data.latest.netCents)} />
              <Stat label="Revenue (all time)" value={usd(data.latest.revenueCents)} hint="transactions transfer_in" />
              <Stat label="Costs (all time)" value={usd(data.latest.costCents)} hint="inference + x402 + transfers out" />
              <Stat label="Credits" value={data.latest.creditsCents == null ? "—" : usd(data.latest.creditsCents)} hint="Conway credit balance at capture" />
              <Stat label={`Net, last ${w ? w.hours.toFixed(1) : "—"} h`} value={usd(w?.netCents)} tone={tone(w?.netCents)} hint={w ? `${when(w.from)} → ${when(w.to)}` : undefined} />
              <Stat label="Net / hour" value={w?.netCentsPerHour == null ? "—" : usd(w.netCentsPerHour)} tone={tone(w?.netCentsPerHour)} hint="measured over the window above" />
              <Stat label="Burn / hour" value={w?.burnCentsPerHour == null ? "—" : usd(w.burnCentsPerHour)} hint="cost growth over the window" />
              <Stat label="Credit runway" value={w?.runwayHours == null ? "—" : `${w.runwayHours.toFixed(1)} h`} tone={w?.runwayHours != null && w.runwayHours < 24 ? "bad" : undefined} hint="credits ÷ burn / hour" />
            </div>
          </Card>
          <Card title="Operator target vs realised" source={`DAILY_TARGET_USD = ${DAILY_TARGET_USD} (src/lib/pnl.ts) — operator goal for comparison, not a forecast or guarantee`}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Stat label="Target / day" value={usd(targetCents)} hint="goal, not a projection" />
              <Stat label="Realised pace / day" value={per24 == null ? "—" : usd(per24)} tone={tone(per24)} hint="net / hour × 24 (measured, not projected forward)" />
              <Stat label="Gap" value={per24 == null ? "—" : usd(per24 - targetCents)} tone={per24 == null ? undefined : per24 >= targetCents ? "good" : "bad"} />
            </div>
            <div className="mt-3 h-2 rounded bg-line">
              <div className="h-2 rounded bg-accent" style={{ width: `${Math.max(0, Math.min(100, ((per24 ?? 0) / targetCents) * 100))}%` }} />
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Cumulative net across snapshots" source="snapshots (agent-signed, latest 500): revenue − cost at each capture">
              <Sparkline points={data.series.map((p) => p.netCents)} />
            </Card>
            <Card title="Credit balance across snapshots" source="snapshots.credits_cents">
              <Sparkline points={data.series.filter((p) => p.creditsCents != null).map((p) => p.creditsCents!)} />
            </Card>
          </div>
          <Card title="Daily net P&L" source={data.dailySource}>
            <SignedBars data={data.daily.slice(-30).reverse()} label="day" value="netCents" format={usd} />
          </Card>
        </>
      )}
      {v && (
        <Card
          title="Edge check — is the profit distinguishable from luck?"
          source="daily net P&L series · PSR/MinTRL: Bailey & López de Prado (2012); DSR: (2014); PBO: Bailey, Borwein, López de Prado & Zhu; haircut: Harvey & Liu"
          right={<span className={`font-mono text-xs ${v.label === "verified_structural_soundness" ? "text-good" : v.n === 0 ? "text-dim" : "text-warn"}`}>{v.label}</span>}
        >
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Daily obs (N)" value={v.n} />
            <Stat label="Daily Sharpe" value={v.sharpeDaily == null ? "NULL" : v.sharpeDaily.toFixed(3)} hint="mean ÷ sd of daily net $ (not annualised)" />
            <Stat label="Gate status" value={v.gateStatus} tone={v.gateStatus === "PASS" ? "good" : v.n === 0 ? undefined : "warn"} />
            <Stat label="MinTRL (95%)" value={v.minTrl == null || !Number.isFinite(v.minTrl) ? "+∞" : v.minTrl.toFixed(1)} hint="daily obs needed" />
          </div>
          {v.n === 0 && (
            <p className="mb-3 text-xs text-dim">
              Waiting for data, not an error: these checks need a real agent&apos;s daily results. They turn green only when that data passes them.
            </p>
          )}
          <div className="hidden md:block">
            <RowsTable rows={v.gates as unknown as Record<string, unknown>[]} columns={["gate", "threshold", "value", "status", "reason"]} />
          </div>
          <ul className="space-y-2 md:hidden">
            {v.gates.map((g) => (
              <li key={g.gate} className="rounded border border-line p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{g.gate}</span>
                  <span className={`font-mono ${gateTone(g.status, v.n)}`}>{g.status}</span>
                </div>
                <dl className="mt-1 grid grid-cols-[5rem_1fr] gap-x-2 gap-y-0.5 font-mono text-dim">
                  <dt>threshold</dt>
                  <dd className="break-words text-fg">{String(g.threshold)}</dd>
                  <dt>value</dt>
                  <dd className="break-words text-fg">{String(g.value)}</dd>
                  <dt>reason</dt>
                  <dd className="break-words">{g.reason == null ? "—" : String(g.reason)}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
            {v.gates.map((g) => (
              <span key={g.gate} className={gateTone(g.status, v.n)}>
                {g.gate}: {g.status}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-dim">
            Method and red-team notes: <Link href="/research" className="text-accent">/research</Link>.
          </p>
        </Card>
      )}
    </div>
  );
}
