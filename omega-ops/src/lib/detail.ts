import { db } from "./db";
import { HttpError } from "./env";
import { FINDING_COLUMNS, type FindingRow } from "./findings";
import { metricBlock, type Metric } from "./metrics";
import { auditHead } from "./pipeline";

export async function anomalyDetail(cve: string): Promise<{ anomaly: FindingRow; metrics: Metric[]; incident: { id: string; state: string; priority: string; opened_at: Date } | null }> {
  const sql = await db();
  const [row] = await sql.unsafe<FindingRow[]>(`SELECT ${FINDING_COLUMNS} FROM ops_finding WHERE cve_id = $1 OR anomaly_no::text = $1`, [cve.toUpperCase()]);
  if (!row) throw new HttpError(404, "no such anomaly");
  const [rank] = await sql<{ rank: string; cohort: string }[]>`
    SELECT (SELECT count(*) + 1 FROM ops_finding x WHERE x.last_seen_batch = ${row.last_seen_batch} AND x.exposure_score > ${row.exposure_score}) AS rank,
           (SELECT count(*) FROM ops_finding y WHERE y.last_seen_batch = ${row.last_seen_batch}) AS cohort`;
  const [incident] = await sql<{ id: string; state: string; priority: string; opened_at: Date }[]>`
    SELECT id, state, priority, opened_at FROM ops_incident WHERE cve_id = ${row.cve_id} ORDER BY id LIMIT 1`;
  const [assets] = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM ops_asset a WHERE lower(COALESCE(a.product, '')) = lower(COALESCE(${row.product}, '~')) OR lower(COALESCE(a.vendor, '')) = lower(COALESCE(${row.vendor}, '~'))`;
  const [batch] = await sql<{ trigger: string; duration_ms: number | null; catalog_version: string | null; catalog_count: number | null }[]>`
    SELECT trigger, duration_ms, catalog_version, catalog_count FROM ops_batch WHERE id = ${row.last_seen_batch}`;
  const [stageAgg] = await sql<{ n: string; bytes: string | null; heap: string | null; rss: string | null }[]>`
    SELECT count(*) AS n, sum(bytes) AS bytes, max(heap_used_mb) AS heap, max(rss_mb) AS rss FROM ops_stage WHERE batch_id = ${row.last_seen_batch}`;
  const metrics = metricBlock(row, {
    batchId: String(row.last_seen_batch ?? ""),
    trigger: batch?.trigger ?? "—",
    durationMs: batch?.duration_ms ?? null,
    sourceBytes: stageAgg?.bytes ? Number(stageAgg.bytes) : null,
    heapMb: stageAgg?.heap ? Number(stageAgg.heap) : null,
    rssMb: stageAgg?.rss ? Number(stageAgg.rss) : null,
    stageCount: stageAgg?.n ? Number(stageAgg.n) : null,
    catalogVersion: batch?.catalog_version ?? null,
    catalogCount: batch?.catalog_count ?? null,
    auditHead: await auditHead(sql),
    rank: rank ? Number(rank.rank) : null,
    cohort: rank ? Number(rank.cohort) : null,
    assetCount: assets ? Number(assets.n) : null,
    incidentState: incident?.state ?? null,
    incidentPriority: incident?.priority ?? null,
    incidentOpenedAt: incident?.opened_at ?? null,
    observedAt: new Date().toISOString(),
  });
  return { anomaly: row, metrics, incident: incident ?? null };
}
