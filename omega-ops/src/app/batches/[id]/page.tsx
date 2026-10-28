import { notFound } from "next/navigation";
import { AnomalyRecord } from "@/components/anomaly-record";
import { Card, ErrorBox, RowsTable } from "@/components/ui";
import { db } from "@/lib/db";
import { FINDING_COLUMNS, type FindingRow } from "@/lib/findings";
import { batchLabel } from "@/lib/narrative";
import { safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function BatchDetail({ params }: PageProps<"/batches/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { data, error } = await safe(async () => {
    const sql = await db();
    const [batch] = await sql<{ id: string; narrative: string | null; status: string; error: string | null }[]>`SELECT id, narrative, status, error FROM ops_batch WHERE id = ${id}`;
    if (!batch) return null;
    const stages = await sql`SELECT name, status, duration_ms, rows_in, rows_out, bytes, requests, heap_used_mb, rss_mb, error FROM ops_stage WHERE batch_id = ${id} ORDER BY id`;
    const anomalies = await sql.unsafe<FindingRow[]>(`SELECT ${FINDING_COLUMNS} FROM ops_finding WHERE last_seen_batch = $1 ORDER BY anomaly_no`, [id]);
    return { batch, stages, anomalies };
  });
  if (!error && !data) notFound();
  return (
    <div className="space-y-4">
      <h1 className="font-mono text-lg font-bold">{batchLabel(id)}</h1>
      <ErrorBox error={error ?? data?.batch.error ?? null} />
      {data && (
        <>
          <Card title="Narrative">{data.batch.narrative ? <pre className="whitespace-pre-wrap font-mono text-[12px]">{data.batch.narrative}</pre> : "—"}</Card>
          <Card title="Stage execution (measured)">
            <RowsTable rows={Array.from(data.stages) as Record<string, unknown>[]} />
          </Card>
          <h2 className="font-mono text-sm font-bold text-dim">ANOMALIES LAST SEEN IN THIS BATCH ({data.anomalies.length})</h2>
          {data.anomalies.map((f) => (
            <AnomalyRecord key={f.cve_id} f={f} compact />
          ))}
        </>
      )}
    </div>
  );
}
