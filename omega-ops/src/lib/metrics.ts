import type { FindingRow } from "./findings";

export interface Metric {
  no: string;
  label: string;
  value: string | null;
  source: "catalog" | "scoring" | "prediction" | "platform" | "derived";
}

const VECTOR_LABELS: Record<string, Record<string, string>> = {
  AV: { N: "Network", A: "Adjacent", L: "Local", P: "Physical" },
  AC: { L: "Low", H: "High" },
  AT: { N: "None", P: "Present" },
  PR: { N: "None", L: "Low", H: "High" },
  UI: { N: "None", R: "Required", P: "Passive", A: "Active" },
  S: { U: "Unchanged", C: "Changed" },
  C: { H: "High", L: "Low", N: "None" },
  I: { H: "High", L: "Low", N: "None" },
  A: { H: "High", L: "Low", N: "None" },
  VC: { H: "High", L: "Low", N: "None" },
  VI: { H: "High", L: "Low", N: "None" },
  VA: { H: "High", L: "Low", N: "None" },
};

export function vectorPart(vector: string | null, key: string): string | null {
  if (!vector) return null;
  const direct = new RegExp(`(?:^|/)${key}:([A-Z])(?:/|$)`).exec(vector);
  if (direct) return VECTOR_LABELS[key]?.[direct[1]] ?? direct[1];
  const alt = key === "C" ? "VC" : key === "I" ? "VI" : key === "A" ? "VA" : null;
  if (alt) {
    const m = new RegExp(`(?:^|/)${alt}:([A-Z])(?:/|$)`).exec(vector);
    if (m) return VECTOR_LABELS[alt]?.[m[1]] ?? m[1];
  }
  return null;
}

const day = 86_400_000;

function days(from: string | Date | null, to: string | Date | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / day);
}

function iso(d: string | Date | null): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().replace(".000", "");
}

function ymd(d: string | Date | null): string | null {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

function num(v: unknown, digits = 2, unit = ""): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : `${n.toFixed(digits)}${unit}`;
}

export interface MetricContext {
  batchId: number | string;
  trigger: string;
  durationMs: number | null;
  sourceBytes: number | null;
  heapMb: number | null;
  rssMb: number | null;
  stageCount: number | null;
  catalogVersion: string | null;
  catalogCount: number | null;
  auditHead: string | null;
  rank: number | null;
  cohort: number | null;
  assetCount: number | null;
  incidentState: string | null;
  incidentPriority: string | null;
  incidentOpenedAt: string | Date | null;
  observedAt: string;
}

/**
 * The fifty-metric block for one anomaly. Every value is read from a public source
 * record or measured by this platform; nothing is estimated. Unavailable metrics
 * stay null and render as an em dash.
 */
export function metricBlock(f: FindingRow, ctx: MetricContext): Metric[] {
  const v = f.cvss_vector;
  const now = ctx.observedAt;
  const m = (no: number, label: string, value: string | null, source: Metric["source"]): Metric => ({
    no: `M${String(no).padStart(2, "0")}`,
    label,
    value,
    source,
  });
  return [
    m(1, "Severity Score", num(f.cvss, 1), "scoring"),
    m(2, "Severity Band", f.cvss_severity, "scoring"),
    m(3, "Scoring Revision", f.cvss_version, "scoring"),
    m(4, "Access Vector", vectorPart(v, "AV"), "scoring"),
    m(5, "Access Complexity", vectorPart(v, "AC"), "scoring"),
    m(6, "Privilege Requirement", vectorPart(v, "PR"), "scoring"),
    m(7, "Interaction Requirement", vectorPart(v, "UI"), "scoring"),
    m(8, "Boundary Scope", v?.startsWith("CVSS:4") ? null : vectorPart(v, "S"), "scoring"),
    m(9, "Confidentiality Impact", vectorPart(v, "C"), "scoring"),
    m(10, "Integrity Impact", vectorPart(v, "I"), "scoring"),
    m(11, "Availability Impact", vectorPart(v, "A"), "scoring"),
    m(12, "Exploitability Subscore", num(f.cvss_exploitability, 1), "scoring"),
    m(13, "Impact Subscore", num(f.cvss_impact, 1), "scoring"),
    m(14, "Vector String", v, "scoring"),
    m(15, "Exploit Probability (30d)", f.epss === null ? null : `${(Number(f.epss) * 100).toFixed(3)}%`, "prediction"),
    m(16, "Exploit Percentile", f.epss_percentile === null ? null : `${(Number(f.epss_percentile) * 100).toFixed(2)}`, "prediction"),
    m(17, "Prediction As-Of", ymd(f.epss_date), "prediction"),
    m(18, "Catalog Listing", f.kev_listed ? "Listed" : "Not listed", "catalog"),
    m(19, "Catalogued On", ymd(f.date_added), "catalog"),
    m(20, "Remediation Window", days(f.date_added, f.due_date) === null ? null : `${days(f.date_added, f.due_date)} d`, "catalog"),
    m(21, "Window Expiry", ymd(f.due_date), "catalog"),
    m(22, "Days Since Catalogued", days(f.date_added, now) === null ? null : `${days(f.date_added, now)} d`, "derived"),
    m(23, "Window Status", f.due_date ? ((days(now, f.due_date) ?? 0) >= 0 ? `${days(now, f.due_date)} d remaining` : `${Math.abs(days(now, f.due_date) ?? 0)} d elapsed`) : null, "derived"),
    m(24, "Extortion Campaign Use", f.ransomware, "catalog"),
    m(25, "Weakness Count", f.cwes.length ? String(f.cwes.length) : null, "scoring"),
    m(26, "Primary Weakness", f.cwes[0] ?? null, "scoring"),
    m(27, "Secondary Weaknesses", f.cwes.length > 1 ? f.cwes.slice(1).join(", ") : null, "scoring"),
    m(28, "Record Published", iso(f.nvd_published), "scoring"),
    m(29, "Record Last Modified", iso(f.nvd_last_modified), "scoring"),
    m(30, "Record Age", days(f.nvd_published, now) === null ? null : `${days(f.nvd_published, now)} d`, "derived"),
    m(31, "Days Since Modification", days(f.nvd_last_modified, now) === null ? null : `${days(f.nvd_last_modified, now)} d`, "derived"),
    m(32, "Record Status", f.vuln_status, "scoring"),
    m(33, "Reference Count", f.reference_count === null ? null : String(f.reference_count), "scoring"),
    m(34, "Affected Vendor", f.vendor, "catalog"),
    m(35, "Affected Product", f.product, "catalog"),
    m(36, "Exposure Index", num(f.exposure_score, 2), "derived"),
    m(37, "Batch Exposure Rank", ctx.rank === null ? null : `#${ctx.rank}${ctx.cohort ? ` of ${ctx.cohort}` : ""}`, "derived"),
    m(38, "Linked Assets", ctx.assetCount === null ? null : String(ctx.assetCount), "platform"),
    m(39, "Incident State", ctx.incidentState, "platform"),
    m(40, "Incident Priority", ctx.incidentPriority, "platform"),
    m(41, "Incident Age", days(ctx.incidentOpenedAt, now) === null ? null : `${days(ctx.incidentOpenedAt, now)} d`, "platform"),
    m(42, "Batch Identifier", `B-${String(ctx.batchId).padStart(6, "0")}`, "platform"),
    m(43, "Batch Trigger", ctx.trigger, "platform"),
    m(44, "Batch Duration", ctx.durationMs === null ? null : `${ctx.durationMs} ms`, "platform"),
    m(45, "Source Bytes Ingested", ctx.sourceBytes === null ? null : `${(ctx.sourceBytes / 1_048_576).toFixed(2)} MiB`, "platform"),
    m(46, "Heap In Use", ctx.heapMb === null ? null : `${Number(ctx.heapMb).toFixed(2)} MiB`, "platform"),
    m(47, "Resident Set", ctx.rssMb === null ? null : `${Number(ctx.rssMb).toFixed(2)} MiB`, "platform"),
    m(48, "Pipeline Stages", ctx.stageCount === null ? null : String(ctx.stageCount), "platform"),
    m(49, "Record Digest", f.record_hash ? `${f.record_hash.slice(0, 16)}…` : null, "platform"),
    m(50, "Audit Chain Head", ctx.auditHead ? `${ctx.auditHead.slice(0, 16)}…` : null, "platform"),
  ];
}
