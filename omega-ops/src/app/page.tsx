import Link from "next/link";
import { after } from "next/server";
import { AnomalyRecord } from "@/components/anomaly-record";
import { AutoRefresh } from "@/components/refresh";
import { RunBatch } from "@/components/run-batch";
import { Card, Empty, ErrorBox, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { FINDING_COLUMNS, type FindingRow } from "@/lib/findings";
import { batchLabel } from "@/lib/narrative";
import { fmtTs, num, safe } from "@/lib/safe";
import { refreshIfStale } from "@/lib/pipeline";
import { balance } from "@/lib/treasury";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BatchRow {
  id: string;
  started_at: Date;
  status: string;
  trigger: string;
  duration_ms: number | null;
  new_findings: number;
  changed_findings: number;
  opened_incidents: number;
  narrative: string | null;
  error: string | null;
}

export default async function Command() {
  after(refreshIfStale);
  const { data, error } = await safe(async () => {
    const sql = await db();
    const batches = await sql<BatchRow[]>`SELECT id, started_at, status, trigger, duration_ms, new_findings, changed_findings, opened_incidents, narrative, error FROM ops_batch ORDER BY id DESC LIMIT 6`;
    const [counts] = await sql<{ findings: string; open: string; p1: string; audit: string }[]>`
      SELECT (SELECT count(*) FROM ops_finding) AS findings,
             (SELECT count(*) FROM ops_incident WHERE state IN ('open','triaged')) AS open,
             (SELECT count(*) FROM ops_incident WHERE state IN ('open','triaged') AND priority = 'p1') AS p1,
             (SELECT count(*) FROM ops_audit) AS audit`;
    const latestOk = batches.find((b) => b.status === "ok");
    const lead = latestOk
      ? await sql.unsafe<(FindingRow & { i_state: string | null; i_priority: string | null })[]>(
          `SELECT ${FINDING_COLUMNS.split(",").map((c) => "f." + c.trim()).join(", ")}, i.state AS i_state, i.priority AS i_priority
           FROM ops_finding f LEFT JOIN ops_incident i ON i.cve_id = f.cve_id AND i.asset_id IS NULL
           WHERE f.last_seen_batch = $1 ORDER BY f.exposure_score DESC NULLS LAST LIMIT 10`,
          [latestOk.id],
        )
      : [];
    return { batches, counts, lead, treasury: await balance(sql), latestOk };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-wide">COMMAND · CONTINUOUS BATCH FEED</h1>
          <p className="text-sm text-dim">A new batch starts on schedule, on operator request, or when the newest batch is over 30 minutes old. Every batch reads the live sources, numbers new anomalies in sequence and seals a narrative written only from what it read.</p>
        </div>
        <div className="flex items-center gap-2">
          <AutoRefresh seconds={30} />
          <RunBatch />
        </div>
      </div>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="anomalies on register" value={num(data.counts.findings)} />
            <Stat label="open incidents" value={num(data.counts.open)} tone={Number(data.counts.open) ? "warn" : undefined} />
            <Stat label="p1 open" value={num(data.counts.p1)} tone={Number(data.counts.p1) ? "bad" : "good"} />
            <Stat label="simulated units available" value={num(data.treasury.available, 2)} hint={`today ${num(data.treasury.spentToday, 2)} / ${num(data.treasury.dailyMax, 0)}`} />
            <Stat label="sealed audit entries" value={num(data.counts.audit)} />
          </div>
          <Card title="Latest batch narrative" right={data.latestOk && <Link className="font-mono text-xs text-accent" href={`/batches/${data.latestOk.id}`}>{batchLabel(data.latestOk.id)} →</Link>}>
            {data.latestOk?.narrative ? <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed">{data.latestOk.narrative}</pre> : <Empty>No completed batch yet. An operator can run one, or the scheduler will.</Empty>}
          </Card>
          <Card title="Recent batches">
            {data.batches.length ? (
              <ul className="divide-y divide-line font-mono text-xs">
                {data.batches.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <Link href={`/batches/${b.id}`} className="text-accent">{batchLabel(b.id)}</Link>
                    <span className={b.status === "ok" ? "text-good" : b.status === "failed" ? "text-bad" : "text-warn"}>{b.status}</span>
                    <span className="text-dim">{fmtTs(b.started_at)}</span>
                    <span>{b.trigger}</span>
                    <span className="text-dim">{num(b.duration_ms)} ms</span>
                    <span>+{b.new_findings} new · {b.changed_findings} changed · {b.opened_incidents} incidents</span>
                    {b.error && <span className="w-full truncate text-bad">{b.error}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No batches recorded.</Empty>
            )}
          </Card>
          <section className="space-y-3">
            <h2 className="font-mono text-sm font-bold text-dim">EXPOSURE LEADERS · {data.latestOk ? batchLabel(data.latestOk.id) : "—"}</h2>
            {data.lead.length ? data.lead.map((f) => <AnomalyRecord key={f.cve_id} f={f} compact incident={f.i_state ? { state: f.i_state, priority: f.i_priority ?? "p3" } : null} />) : <Empty>No anomalies in the latest batch.</Empty>}
          </section>
        </>
      )}
    </div>
  );
}
