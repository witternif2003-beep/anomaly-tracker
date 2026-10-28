import { AutoRefresh } from "@/components/refresh";
import { Bars, Card, ErrorBox, RowsTable, Sparkline, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { DAG, processMemory } from "@/lib/pipeline";
import { num, safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function Telemetry() {
  const mem = processMemory();
  const heapTotalMb = Math.round((process.memoryUsage().heapTotal / 1_048_576) * 100) / 100;
  const { data, error } = await safe(async () => {
    const sql = await db();
    const stages = await sql<{ name: string; runs: string; avg_ms: string | null; max_ms: number | null; avg_heap_mb: string | null; max_rss_mb: string | null; bytes: string | null; failures: string }[]>`
      SELECT name, count(*) AS runs, round(avg(duration_ms)) AS avg_ms, max(duration_ms) AS max_ms, round(avg(heap_used_mb), 2) AS avg_heap_mb, max(rss_mb) AS max_rss_mb, sum(bytes) AS bytes, count(*) FILTER (WHERE status = 'failed') AS failures
      FROM ops_stage GROUP BY name`;
    const series = await sql<{ duration_ms: number | null }[]>`SELECT duration_ms FROM ops_batch WHERE status = 'ok' ORDER BY id DESC LIMIT 40`;
    const heap = await sql<{ heap: string | null }[]>`SELECT max(heap_used_mb) AS heap FROM ops_stage GROUP BY batch_id ORDER BY batch_id DESC LIMIT 40`;
    const order = new Map(DAG.map((s, i) => [s.name, i]));
    return { stages: [...stages].sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99)), series: series.map((s) => s.duration_ms ?? 0).reverse(), heap: heap.map((h) => Number(h.heap ?? 0)).reverse() };
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold">MEMORY & RUNTIME TELEMETRY</h1>
          <p className="text-sm text-dim">Measured by the platform itself on every stage. Nothing here is estimated.</p>
        </div>
        <AutoRefresh seconds={15} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="heap used (this instance)" value={`${num(mem.heap, 1)} MB`} />
        <Stat label="heap total" value={`${num(heapTotalMb, 1)} MB`} />
        <Stat label="resident set" value={`${num(mem.rss, 1)} MB`} />
        <Stat label="instance uptime" value={`${num(process.uptime())} s`} hint={process.version} />
      </div>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Batch wall time, ms (oldest → newest)"><Sparkline points={data.series} /></Card>
            <Card title="Peak heap per batch, MB"><Sparkline points={data.heap} /></Card>
          </div>
          <Card title="Average stage duration, ms">
            <Bars data={data.stages.map((s) => ({ name: s.name, ms: Number(s.avg_ms ?? 0) }))} label="name" value="ms" />
          </Card>
          <Card title="Per-stage aggregates">
            <RowsTable rows={data.stages as unknown as Record<string, unknown>[]} />
          </Card>
        </>
      )}
    </div>
  );
}
