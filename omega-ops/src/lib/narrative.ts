import { anomalyLabel, classOf, codename, type FindingRow } from "./findings";

export interface BatchSummary {
  id: string | number;
  started_at: string | Date;
  finished_at: string | Date | null;
  duration_ms: number | null;
  status: string;
  trigger: string;
  actor: string | null;
  catalog_version: string | null;
  catalog_released: string | Date | null;
  catalog_count: number | null;
  window_start: string | Date | null;
  window_end: string | Date | null;
  new_findings: number;
  changed_findings: number;
  opened_incidents: number;
  cost_units: string | number;
  narrative: string | null;
  error: string | null;
}

const ts = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().replace(".000", "") : "—");

/**
 * Deterministic batch narrative. Every number is read back from the rows the
 * batch wrote, so the text and the tables can never disagree.
 */
export function buildNarrative(batch: {
  id: string | number;
  startedAt: Date;
  durationMs: number;
  trigger: string;
  actor: string;
  catalogVersion: string | null;
  catalogReleased: string | null;
  catalogCount: number | null;
  windowStart: string;
  windowEnd: string;
  windowTotal: number;
  newFindings: number;
  changedFindings: number;
  openedIncidents: number;
  scored: number;
  predicted: number;
  costUnits: number;
  sourceBytes: number;
  top: FindingRow[];
}): string {
  const lines: string[] = [];
  lines.push(`OMEGA PROTOCOL — CONTINUOUS BATCH B-${String(batch.id).padStart(6, "0")}`);
  lines.push(`OBSERVED: ${ts(batch.startedAt)} — ELAPSED ${batch.durationMs} ms — TRIGGER ${batch.trigger.toUpperCase()} — INITIATED BY ${batch.actor}`);
  lines.push(
    `SOURCE STATE: catalog ${batch.catalogVersion ?? "—"} released ${ts(batch.catalogReleased)} carrying ${batch.catalogCount ?? "—"} catalogued entries; change window ${ts(batch.windowStart)} to ${ts(batch.windowEnd)} reported ${batch.windowTotal} modified records; ${(batch.sourceBytes / 1_048_576).toFixed(2)} MiB read.`,
  );
  lines.push(
    `BATCH RESULT: ${batch.newFindings} anomalies entered the register, ${batch.changedFindings} existing anomalies changed, ${batch.scored} carry a severity score, ${batch.predicted} carry an exploit prediction, ${batch.openedIncidents} incidents opened. Batch charged ${batch.costUnits} simulated compute units.`,
  );
  if (!batch.top.length) {
    lines.push("NO ANOMALY MET THE EXPOSURE THRESHOLD IN THIS BATCH.");
    return lines.join("\n");
  }
  lines.push("");
  lines.push(`EXPOSURE LEADERS THIS BATCH (${batch.top.length}):`);
  for (const f of batch.top) {
    const epss = f.epss === null ? "no prediction" : `${(Number(f.epss) * 100).toFixed(3)}% 30-day exploit probability`;
    const sev = f.cvss === null ? "unscored" : `severity ${Number(f.cvss).toFixed(1)} ${f.cvss_severity ?? ""}`.trim();
    lines.push(
      `· ${anomalyLabel(f)} ${codename(f)} — ${f.cve_id} — ${f.vendor ?? "—"} ${f.product ?? "—"} — ${classOf(f)} — exposure ${Number(f.exposure_score ?? 0).toFixed(2)} — ${sev} — ${epss}${f.ransomware?.toLowerCase() === "known" ? " — extortion campaign use observed" : ""}.`,
    );
  }
  return lines.join("\n");
}

export function batchLabel(id: string | number): string {
  return `B-${String(id).padStart(6, "0")}`;
}
