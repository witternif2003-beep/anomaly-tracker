import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { DAG, processMemory } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = await db();
  const stages = await sql`
    SELECT name, count(*) AS runs,
           round(avg(duration_ms)) AS avg_ms, max(duration_ms) AS max_ms, min(duration_ms) AS min_ms,
           round(avg(heap_used_mb), 2) AS avg_heap_mb, max(rss_mb) AS max_rss_mb,
           sum(bytes) AS bytes, sum(rows_out) AS rows_out,
           count(*) FILTER (WHERE status = 'failed') AS failures
    FROM ops_stage GROUP BY name`;
  const recent = await sql`
    SELECT s.batch_id, s.name, s.status, s.duration_ms, s.heap_used_mb, s.rss_mb, s.rows_out, s.bytes, s.started_at
    FROM ops_stage s ORDER BY s.id DESC LIMIT 60`;
  const series = await sql`
    SELECT id, duration_ms, new_findings, changed_findings, cost_units, started_at, status
    FROM ops_batch WHERE status = 'ok' ORDER BY id DESC LIMIT 40`;
  return json({ dag: DAG, stages, recent, series, runtime: { ...processMemory(), uptimeSec: Math.round(process.uptime()), node: process.version } });
});
