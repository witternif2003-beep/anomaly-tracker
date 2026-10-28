import Link from "next/link";
import { AutoRefresh } from "@/components/refresh";
import { Card, Empty, ErrorBox } from "@/components/ui";
import { db } from "@/lib/db";
import { batchLabel } from "@/lib/narrative";
import { fmtTs, num, safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function Batches() {
  const { data, error } = await safe(async () => {
    const sql = await db();
    return sql<{ id: string; started_at: Date; status: string; trigger: string; actor: string | null; duration_ms: number | null; catalog_version: string | null; new_findings: number; changed_findings: number; opened_incidents: number; cost_units: string; narrative: string | null; error: string | null }[]>`
      SELECT id, started_at, status, trigger, actor, duration_ms, catalog_version, new_findings, changed_findings, opened_incidents, cost_units, narrative, error FROM ops_batch ORDER BY id DESC LIMIT 100`;
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold">BATCH LEDGER</h1>
        <AutoRefresh seconds={30} />
      </div>
      <ErrorBox error={error} />
      {data && !data.length && <Empty>No batches recorded.</Empty>}
      {data?.map((b) => (
        <Card key={b.id} title={<Link href={`/batches/${b.id}`} className="text-accent">{batchLabel(b.id)}</Link>} right={<span className={`font-mono text-xs ${b.status === "ok" ? "text-good" : b.status === "failed" ? "text-bad" : "text-warn"}`}>{b.status}</span>}>
          <p className="mb-2 font-mono text-[11px] text-dim">
            {fmtTs(b.started_at)} · {b.trigger} · {b.actor ?? "—"} · {num(b.duration_ms)} ms · catalog {b.catalog_version ?? "—"} · +{b.new_findings} new · {b.changed_findings} changed · {b.opened_incidents} incidents · {num(b.cost_units, 2)} simulated units
          </p>
          {b.narrative ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[12px]">{b.narrative}</pre> : <p className="font-mono text-xs text-bad">{b.error ?? "no narrative"}</p>}
        </Card>
      ))}
    </div>
  );
}
