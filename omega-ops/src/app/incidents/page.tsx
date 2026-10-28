import Link from "next/link";
import { AnomalyRecord } from "@/components/anomaly-record";
import { IncidentActions } from "@/components/incident-actions";
import { AutoRefresh } from "@/components/refresh";
import { Empty, ErrorBox } from "@/components/ui";
import { db } from "@/lib/db";
import { anomalyDetail } from "@/lib/detail";
import { fmtTs, num, safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = { p1: "border-bad/60 text-bad", p2: "border-warn/60 text-warn", p3: "border-line text-dim" };

export default async function Incidents() {
  const { data, error } = await safe(async () => {
    const sql = await db();
    return sql<{ id: string; cve_id: string; state: string; priority: string; opened_at: Date; opened_batch: string | null; assignee: string | null; vendor: string | null; product: string | null; title: string | null; exposure_score: string | null; asset_name: string | null }[]>`
      SELECT i.id, i.cve_id, i.state, i.priority, i.opened_at, i.opened_batch, i.assignee, f.vendor, f.product, f.title, f.exposure_score, a.name AS asset_name
      FROM ops_incident i JOIN ops_finding f ON f.cve_id = i.cve_id LEFT JOIN ops_asset a ON a.id = i.asset_id
      ORDER BY (i.state IN ('open','triaged')) DESC, CASE i.priority WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 ELSE 3 END, f.exposure_score DESC NULLS LAST LIMIT 300`;
  });
  const records = new Map<string, Awaited<ReturnType<typeof anomalyDetail>>>();
  if (data) {
    const cves = [...new Set(data.map((i) => i.cve_id))];
    for (let k = 0; k < cves.length; k += 8) {
      const chunk = await Promise.allSettled(cves.slice(k, k + 8).map((c) => anomalyDetail(c)));
      chunk.forEach((r, j) => r.status === "fulfilled" && records.set(cves[k + j], r.value));
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold">INCIDENT DESK</h1>
          <p className="text-sm text-dim">Opened automatically when an anomaly&apos;s exposure reaches 60. Each incident carries its full anomaly record and M01–M50 block. Changing state needs an operator session and is sealed into the audit chain.</p>
        </div>
        <AutoRefresh seconds={30} />
      </div>
      <ErrorBox error={error} />
      {data && !data.length && <Empty>No incidents.</Empty>}
      <ul className="space-y-2">
        {data?.map((i) => (
          <li key={i.id} className="rounded-lg border border-line bg-panel p-3 font-mono text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-1.5 ${TONE[i.priority] ?? TONE.p3}`}>{i.priority}</span>
              <span>{i.state}</span>
              <Link href={`/anomalies/${i.cve_id}`} className="text-accent">{i.cve_id}</Link>
              <span className="text-dim">exposure {num(i.exposure_score, 2)}</span>
              <span className="ml-auto"><IncidentActions id={i.id} state={i.state} /></span>
            </div>
            <p className="mt-1 break-words">{i.vendor} · {i.product} — {i.title}</p>
            <p className="mt-1 text-dim">INC-{i.id} · opened {fmtTs(i.opened_at)} · batch {i.opened_batch ?? "—"} · asset {i.asset_name ?? "unscoped"} · assignee {i.assignee ?? "—"}</p>
            {records.has(i.cve_id) && (
              <div className="mt-3">
                <AnomalyRecord f={records.get(i.cve_id)!.anomaly} metrics={records.get(i.cve_id)!.metrics} incident={{ state: i.state, priority: i.priority }} attribution={records.get(i.cve_id)!.attribution} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
