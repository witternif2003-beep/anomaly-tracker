import type postgres from "postgres";
import { assetMatch } from "./groups";
import { appendAudit, GENESIS_HASH } from "./audit";
import { db } from "./db";
import { env, HttpError } from "./env";
import { FINDING_COLUMNS, type FindingRow } from "./findings";
import { canonicalJson, sha256Hex } from "./hash";
import { buildNarrative } from "./narrative";
import { exposureScore, fetchEpss, fetchKev, fetchNvdByIds, fetchNvdWindow, type KevEntry, type NvdMetric } from "./sources";
import { assertWithinLimits, costOf, recordSpend } from "./treasury";

/** Static shape of the ingestion graph; stage rows carry each run's measurements. */
export const DAG: { name: string; dependsOn: string[]; detail: string }[] = [
  { name: "catalog_fetch", dependsOn: [], detail: "Read the exploited-vulnerability catalog" },
  { name: "window_fetch", dependsOn: [], detail: "Read records modified inside the change window" },
  { name: "correlate", dependsOn: ["catalog_fetch", "window_fetch"], detail: "Select this batch's candidate anomalies" },
  { name: "enrich", dependsOn: ["correlate"], detail: "Attach severity scoring to candidates" },
  { name: "predict", dependsOn: ["enrich"], detail: "Attach exploit prediction to candidates" },
  { name: "persist", dependsOn: ["predict"], detail: "Number and upsert anomaly records" },
  { name: "incidents", dependsOn: ["persist"], detail: "Open incidents above the exposure threshold" },
  { name: "narrate", dependsOn: ["incidents"], detail: "Compose the batch narrative" },
  { name: "settle", dependsOn: ["narrate"], detail: "Charge the simulated treasury and seal the audit record" },
];

export const INCIDENT_THRESHOLD = 60;
const MAX_CANDIDATES = 60;
const MAX_BY_ID_LOOKUPS = 5;
const RECENT_CATALOG_DAYS = 30;

const mb = (bytes: number) => Math.round((bytes / 1_048_576) * 100) / 100;

function mem() {
  const m = process.memoryUsage();
  return { heap: mb(m.heapUsed), rss: mb(m.rss) };
}

class StageRecorder {
  private seq = 0;
  constructor(
    private sql: postgres.Sql,
    private batchId: string,
  ) {}

  async run<T>(name: string, fn: () => Promise<{ value: T; rowsIn?: number; rowsOut?: number; bytes?: number; requests?: number; warning?: string }>): Promise<T> {
    const node = DAG.find((d) => d.name === name);
    const started = new Date();
    const t0 = performance.now();
    try {
      const out = await fn();
      const { heap, rss } = mem();
      await this.sql`
        INSERT INTO ops_stage (batch_id, name, depends_on, status, started_at, finished_at, duration_ms, rows_in, rows_out, bytes, requests, heap_used_mb, rss_mb, error)
        VALUES (${this.batchId}, ${name}, ${node?.dependsOn ?? []}, ${out.warning ? "degraded" : "ok"}, ${started}, ${new Date()}, ${Math.round(performance.now() - t0)},
                ${out.rowsIn ?? null}, ${out.rowsOut ?? null}, ${out.bytes ?? null}, ${out.requests ?? null}, ${heap}, ${rss}, ${out.warning ?? null})`;
      this.seq += 1;
      return out.value;
    } catch (err) {
      const { heap, rss } = mem();
      await this.sql`
        INSERT INTO ops_stage (batch_id, name, depends_on, status, started_at, finished_at, duration_ms, heap_used_mb, rss_mb, error)
        VALUES (${this.batchId}, ${name}, ${node?.dependsOn ?? []}, 'failed', ${started}, ${new Date()}, ${Math.round(performance.now() - t0)}, ${heap}, ${rss},
                ${err instanceof Error ? err.message : String(err)})`;
      throw err;
    }
  }

  get count(): number {
    return this.seq;
  }
}

export interface BatchResult {
  batchId: string;
  status: "ok";
  durationMs: number;
  newFindings: number;
  changedFindings: number;
  openedIncidents: number;
  candidates: number;
  costUnits: number;
  narrative: string;
}

function kevUrl(e: KevEntry): string | null {
  const first = e.notes?.split(/[;\s]+/).find((t) => t.startsWith("http"));
  return first ?? null;
}

/**
 * One continuous batch: read the public sources, correlate them, number and store
 * every anomaly, open incidents, write the narrative and seal the audit record.
 */
export async function runBatch(opts: { trigger: string; actor: string; role: string }): Promise<BatchResult> {
  const sql = await db();

  const [recent] = await sql<{ started_at: Date; status: string }[]>`SELECT started_at, status FROM ops_batch ORDER BY id DESC LIMIT 1`;
  if (recent && recent.status === "running" && Date.now() - new Date(recent.started_at).getTime() < 120_000) {
    throw new HttpError(409, "a batch is already running");
  }
  if (recent && Date.now() - new Date(recent.started_at).getTime() < env.batchMinIntervalSec * 1000) {
    const wait = Math.ceil((env.batchMinIntervalSec * 1000 - (Date.now() - new Date(recent.started_at).getTime())) / 1000);
    throw new HttpError(429, `batch interval not elapsed; ${wait}s remaining`);
  }
  await assertWithinLimits(sql, costOf(0));

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - env.nvdWindowHours * 3_600_000);
  const [batch] = await sql<{ id: string }[]>`
    INSERT INTO ops_batch (status, trigger, actor, window_start, window_end)
    VALUES ('running', ${opts.trigger}, ${opts.actor}, ${windowStart}, ${windowEnd}) RETURNING id`;
  const batchId = String(batch.id);
  const t0 = performance.now();
  const stages = new StageRecorder(sql, batchId);
  let bytes = 0;

  try {
    const catalog = await stages.run("catalog_fetch", async () => {
      const { catalog, bytes: b } = await fetchKev();
      bytes += b;
      return { value: catalog, rowsOut: catalog.vulnerabilities.length, bytes: b };
    });

    const window = await stages.run("window_fetch", async () => {
      try {
        const w = await fetchNvdWindow(windowStart.toISOString(), windowEnd.toISOString());
        bytes += w.bytes;
        return { value: w, rowsOut: w.metrics.size, bytes: w.bytes, requests: w.pages };
      } catch (e) {
        const empty = { metrics: new Map<string, NvdMetric>(), total: 0, bytes: 0, pages: 0 };
        return { value: empty, rowsOut: 0, requests: 1, warning: `change window unavailable: ${e instanceof Error ? e.message : String(e)}` };
      }
    });

    const candidates = await stages.run("correlate", async () => {
      const cutoff = Date.now() - RECENT_CATALOG_DAYS * 86_400_000;
      const seen = await sql<{ cve_id: string }[]>`SELECT cve_id FROM ops_finding`;
      const known = new Set(seen.map((r) => r.cve_id));
      const scored = catalog.vulnerabilities.map((e) => {
        const addedAt = new Date(e.dateAdded).getTime();
        const inWindow = window.metrics.has(e.cveID);
        const fresh = Number.isFinite(addedAt) && addedAt >= cutoff;
        const unseen = !known.has(e.cveID);
        const weight = (unseen ? 4 : 0) + (fresh ? 3 : 0) + (inWindow ? 2 : 0);
        return { entry: e, weight, addedAt };
      });
      const picked = scored
        .filter((s) => s.weight > 0)
        .sort((a, b) => b.weight - a.weight || b.addedAt - a.addedAt)
        .slice(0, MAX_CANDIDATES)
        .map((s) => s.entry);
      return { value: picked, rowsIn: catalog.vulnerabilities.length, rowsOut: picked.length };
    });

    const metrics = await stages.run("enrich", async () => {
      const map = new Map<string, NvdMetric>();
      for (const c of candidates) {
        const hit = window.metrics.get(c.cveID);
        if (hit) map.set(c.cveID, hit);
      }
      const missing = candidates.filter((c) => !map.has(c.cveID)).map((c) => c.cveID);
      const have = await sql<{ cve_id: string }[]>`SELECT cve_id FROM ops_finding WHERE cve_id = ANY(${missing}) AND cvss IS NOT NULL`;
      const haveSet = new Set(have.map((r) => r.cve_id));
      const lookup = missing.filter((id) => !haveSet.has(id)).slice(0, MAX_BY_ID_LOOKUPS);
      let requests = 0;
      let warning: string | undefined;
      if (lookup.length) {
        const r = await fetchNvdByIds(lookup);
        bytes += r.bytes;
        requests = r.requests;
        if (r.failed) warning = `${r.failed} of ${r.requests} severity lookups did not answer in time`;
        for (const [k, v] of r.metrics) map.set(k, v);
      }
      return { value: map, rowsIn: candidates.length, rowsOut: map.size, requests, warning };
    });

    const scores = await stages.run("predict", async () => {
      const r = await fetchEpss(candidates.map((c) => c.cveID));
      bytes += r.bytes;
      return { value: r.scores, rowsIn: candidates.length, rowsOut: r.scores.size, bytes: r.bytes, requests: r.requests };
    });

    const persisted = await stages.run("persist", async () => {
      let created = 0;
      let changed = 0;
      for (const e of candidates) {
        const m = metrics.get(e.cveID) ?? null;
        const s = scores.get(e.cveID) ?? null;
        const exposure = exposureScore({
          kevListed: true,
          epss: s?.epss ?? null,
          cvss: m?.cvss ?? null,
          ransomware: e.knownRansomwareCampaignUse ?? null,
        });
        const payload = {
          cve: e.cveID,
          vendor: e.vendorProject,
          product: e.product,
          title: e.vulnerabilityName,
          dateAdded: e.dateAdded,
          dueDate: e.dueDate,
          cvss: m?.cvss ?? null,
          vector: m?.vector ?? null,
          epss: s?.epss ?? null,
          exposure,
        };
        const hash = sha256Hex(canonicalJson(payload));
        const [row] = await sql<{ inserted: boolean }[]>`
          INSERT INTO ops_finding (
            cve_id, anomaly_no, vendor, product, title, summary, date_added, due_date, ransomware, cwes,
            source, source_url, epss, epss_percentile, epss_date, cvss, cvss_vector, cvss_severity, cvss_version,
            cvss_exploitability, cvss_impact, vuln_status, reference_count, nvd_published, nvd_last_modified,
            exposure_score, kev_listed, kev_raw, nvd_raw, epss_raw, record_hash, first_seen_batch, last_seen_batch)
          VALUES (
            ${e.cveID}, nextval('ops_anomaly_no'), ${e.vendorProject}, ${e.product}, ${e.vulnerabilityName},
            ${m?.description ?? e.shortDescription ?? null}, ${e.dateAdded || null}, ${e.dueDate || null},
            ${e.knownRansomwareCampaignUse ?? null}, ${(m?.cwes?.length ? m.cwes : (e.cwes ?? [])) as string[]},
            'catalog+scoring+prediction', ${kevUrl(e)}, ${s?.epss ?? null}, ${s?.percentile ?? null}, ${s?.date ?? null},
            ${m?.cvss ?? null}, ${m?.vector ?? null}, ${m?.severity ?? null}, ${m?.version ?? null},
            ${m?.exploitability ?? null}, ${m?.impact ?? null}, ${m?.vulnStatus ?? null}, ${m?.references ?? null},
            ${m?.published ?? null}, ${m?.lastModified ?? null}, ${exposure}, true,
            ${sql.json(e as unknown as postgres.JSONValue)}, ${m ? sql.json(m as unknown as postgres.JSONValue) : null},
            ${s ? sql.json(s as unknown as postgres.JSONValue) : null}, ${hash}, ${batchId}, ${batchId})
          ON CONFLICT (cve_id) DO UPDATE SET
            vendor = EXCLUDED.vendor, product = EXCLUDED.product, title = EXCLUDED.title,
            summary = COALESCE(EXCLUDED.summary, ops_finding.summary),
            date_added = COALESCE(EXCLUDED.date_added, ops_finding.date_added),
            due_date = COALESCE(EXCLUDED.due_date, ops_finding.due_date),
            ransomware = EXCLUDED.ransomware,
            cwes = CASE WHEN array_length(EXCLUDED.cwes, 1) IS NULL THEN ops_finding.cwes ELSE EXCLUDED.cwes END,
            source_url = COALESCE(EXCLUDED.source_url, ops_finding.source_url),
            epss = COALESCE(EXCLUDED.epss, ops_finding.epss),
            epss_percentile = COALESCE(EXCLUDED.epss_percentile, ops_finding.epss_percentile),
            epss_date = COALESCE(EXCLUDED.epss_date, ops_finding.epss_date),
            cvss = COALESCE(EXCLUDED.cvss, ops_finding.cvss),
            cvss_vector = COALESCE(EXCLUDED.cvss_vector, ops_finding.cvss_vector),
            cvss_severity = COALESCE(EXCLUDED.cvss_severity, ops_finding.cvss_severity),
            cvss_version = COALESCE(EXCLUDED.cvss_version, ops_finding.cvss_version),
            cvss_exploitability = COALESCE(EXCLUDED.cvss_exploitability, ops_finding.cvss_exploitability),
            cvss_impact = COALESCE(EXCLUDED.cvss_impact, ops_finding.cvss_impact),
            vuln_status = COALESCE(EXCLUDED.vuln_status, ops_finding.vuln_status),
            reference_count = COALESCE(EXCLUDED.reference_count, ops_finding.reference_count),
            nvd_published = COALESCE(EXCLUDED.nvd_published, ops_finding.nvd_published),
            nvd_last_modified = COALESCE(EXCLUDED.nvd_last_modified, ops_finding.nvd_last_modified),
            exposure_score = EXCLUDED.exposure_score,
            kev_listed = true,
            kev_raw = EXCLUDED.kev_raw,
            nvd_raw = COALESCE(EXCLUDED.nvd_raw, ops_finding.nvd_raw),
            epss_raw = COALESCE(EXCLUDED.epss_raw, ops_finding.epss_raw),
            record_hash = EXCLUDED.record_hash,
            last_seen_batch = EXCLUDED.last_seen_batch,
            updated_at = now()
          RETURNING (xmax = 0) AS inserted`;
        if (row?.inserted) created += 1;
        else changed += 1;
      }
      return { value: { created, changed }, rowsIn: candidates.length, rowsOut: created + changed };
    });

    const opened = await stages.run("incidents", async () => {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO ops_incident (cve_id, asset_id, opened_batch, priority)
        SELECT f.cve_id, NULL, ${batchId},
               CASE WHEN f.exposure_score >= 85 THEN 'p1' WHEN f.exposure_score >= 72 THEN 'p2' ELSE 'p3' END
        FROM ops_finding f
        WHERE f.last_seen_batch = ${batchId} AND f.exposure_score >= ${INCIDENT_THRESHOLD}
        ON CONFLICT (cve_id, asset_id) DO NOTHING
        RETURNING id`;
      const scoped = await sql<{ id: string }[]>`
        INSERT INTO ops_incident (cve_id, asset_id, opened_batch, priority)
        SELECT f.cve_id, a.id, ${batchId},
               CASE WHEN f.exposure_score >= 85 THEN 'p1' WHEN f.exposure_score >= 72 THEN 'p2' ELSE 'p3' END
        FROM ops_finding f JOIN ops_asset a ON ${assetMatch(sql)}
        WHERE f.last_seen_batch = ${batchId} AND f.exposure_score >= ${INCIDENT_THRESHOLD} AND a.asset_group IS NOT NULL
        ON CONFLICT (cve_id, asset_id) DO NOTHING
        RETURNING id`;
      return { value: rows.length + scoped.length, rowsOut: rows.length + scoped.length };
    });

    const narrative = await stages.run("narrate", async () => {
      const top = await sql.unsafe<FindingRow[]>(
        `SELECT ${FINDING_COLUMNS} FROM ops_finding WHERE last_seen_batch = $1 ORDER BY exposure_score DESC NULLS LAST LIMIT 10`,
        [batchId],
      );
      const scoredCount = await sql<{ n: string }[]>`SELECT count(*) AS n FROM ops_finding WHERE last_seen_batch = ${batchId} AND cvss IS NOT NULL`;
      const predictedCount = await sql<{ n: string }[]>`SELECT count(*) AS n FROM ops_finding WHERE last_seen_batch = ${batchId} AND epss IS NOT NULL`;
      const text = buildNarrative({
        id: batchId,
        startedAt: new Date(Date.now() - (performance.now() - t0)),
        durationMs: Math.round(performance.now() - t0),
        trigger: opts.trigger,
        actor: opts.actor,
        catalogVersion: catalog.catalogVersion,
        catalogReleased: catalog.dateReleased,
        catalogCount: catalog.count,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        windowTotal: window.total,
        newFindings: persisted.created,
        changedFindings: persisted.changed,
        openedIncidents: opened,
        scored: Number(scoredCount[0]?.n ?? 0),
        predicted: Number(predictedCount[0]?.n ?? 0),
        costUnits: costOf(bytes),
        sourceBytes: bytes,
        top: Array.from(top),
      });
      return { value: text, rowsOut: top.length };
    });

    const cost = costOf(bytes);
    await stages.run("settle", async () => {
      await recordSpend(sql, batchId, cost, `batch ${batchId} ingest`, opts.actor);
      await appendAudit(sql, {
        actor: opts.actor,
        role: opts.role,
        action: "batch.complete",
        subject: `batch:${batchId}`,
        details: {
          trigger: opts.trigger,
          candidates: candidates.length,
          new: persisted.created,
          changed: persisted.changed,
          incidents: opened,
          sourceBytes: bytes,
          costUnits: cost,
          catalogVersion: catalog.catalogVersion,
        },
      });
      return { value: null, rowsOut: 1 };
    });

    const durationMs = Math.round(performance.now() - t0);
    await sql`
      UPDATE ops_batch SET status = 'ok', finished_at = now(), duration_ms = ${durationMs},
        catalog_version = ${catalog.catalogVersion}, catalog_released = ${catalog.dateReleased},
        catalog_count = ${catalog.count}, new_findings = ${persisted.created}, changed_findings = ${persisted.changed},
        opened_incidents = ${opened}, cost_units = ${cost}, narrative = ${narrative}
      WHERE id = ${batchId}`;

    return {
      batchId,
      status: "ok",
      durationMs,
      newFindings: persisted.created,
      changedFindings: persisted.changed,
      openedIncidents: opened,
      candidates: candidates.length,
      costUnits: cost,
      narrative,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`UPDATE ops_batch SET status = 'failed', finished_at = now(), duration_ms = ${Math.round(performance.now() - t0)}, error = ${message} WHERE id = ${batchId}`;
    await appendAudit(sql, { actor: opts.actor, role: opts.role, action: "batch.failed", subject: `batch:${batchId}`, details: { error: message } }).catch(() => {});
    throw err;
  }
}

export async function auditHead(sql: postgres.Sql): Promise<string> {
  const [row] = await sql<{ hash: string }[]>`SELECT hash FROM ops_audit ORDER BY seq DESC LIMIT 1`;
  return row?.hash ?? GENESIS_HASH;
}

export { mem as processMemory };

/**
 * Keeps the feed current between scheduled runs: when the newest batch is older than
 * BATCH_STALE_MIN minutes, a page view starts one. The running-batch guard, minimum
 * interval and spending limits in runBatch still apply.
 */
export async function refreshIfStale(): Promise<void> {
  try {
    const sql = await db();
    const [last] = await sql<{ started_at: Date; status: string }[]>`SELECT started_at, status FROM ops_batch ORDER BY id DESC LIMIT 1`;
    if (last && (last.status === "running" || Date.now() - new Date(last.started_at).getTime() < env.batchStaleMin * 60_000)) return;
    await runBatch({ trigger: "freshness", actor: "system", role: "operator" });
  } catch (e) {
    console.error("[freshness] batch not started:", e instanceof Error ? e.message : e);
  }
}
