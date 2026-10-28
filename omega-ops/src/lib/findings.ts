export interface FindingRow {
  cve_id: string;
  anomaly_no: string | number | null;
  vendor: string | null;
  product: string | null;
  title: string | null;
  summary: string | null;
  date_added: string | Date | null;
  due_date: string | Date | null;
  ransomware: string | null;
  cwes: string[];
  source: string;
  source_url: string | null;
  epss: string | number | null;
  epss_percentile: string | number | null;
  epss_date: string | Date | null;
  cvss: string | number | null;
  cvss_vector: string | null;
  cvss_severity: string | null;
  cvss_version: string | null;
  cvss_exploitability: string | number | null;
  cvss_impact: string | number | null;
  vuln_status: string | null;
  reference_count: number | null;
  nvd_published: string | Date | null;
  nvd_last_modified: string | Date | null;
  exposure_score: string | number | null;
  kev_listed: boolean;
  record_hash: string | null;
  first_seen_batch: string | number | null;
  last_seen_batch: string | number | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export const FINDING_COLUMNS = `cve_id, anomaly_no, vendor, product, title, summary, date_added, due_date, ransomware, cwes,
  source, source_url, epss, epss_percentile, epss_date, cvss, cvss_vector, cvss_severity, cvss_version,
  cvss_exploitability, cvss_impact, vuln_status, reference_count, nvd_published, nvd_last_modified,
  exposure_score, kev_listed, record_hash, first_seen_batch, last_seen_batch, created_at, updated_at`;

/** Stable, people-free codename built from the affected product, e.g. ADOBE-COMMERCE-48356. */
export function codename(f: Pick<FindingRow, "vendor" | "product" | "cve_id">): string {
  const slug = (s: string | null) =>
    (s ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .split("-")
      .filter(Boolean)
      .slice(0, 2)
      .join("-");
  const tail = f.cve_id.split("-").pop() ?? "";
  return [slug(f.vendor), slug(f.product), tail].filter(Boolean).join("-").slice(0, 48) || f.cve_id;
}

export function anomalyLabel(f: Pick<FindingRow, "anomaly_no">): string {
  return f.anomaly_no === null ? "UNNUMBERED" : String(f.anomaly_no);
}

export function classOf(f: Pick<FindingRow, "cwes" | "title">): string {
  const t = (f.title ?? "").toLowerCase();
  const pairs: [RegExp, string][] = [
    [/command injection|os command/, "Command Injection"],
    [/sql injection/, "Injection / Data Store"],
    [/deserializ/, "Unsafe Deserialization"],
    [/path traversal|directory traversal/, "Path Traversal"],
    [/authentication bypass|improper authentication|missing auth/, "Authentication Bypass"],
    [/authorization|access control/, "Authorization Failure"],
    [/buffer overflow|out-of-bounds|memory corruption|use-after-free/, "Memory Safety"],
    [/cross-site scripting/, "Script Injection"],
    [/server-side request forgery|ssrf/, "Server-Side Request Forgery"],
    [/unrestricted upload|file upload/, "Unrestricted Upload"],
    [/code execution|rce/, "Remote Code Execution"],
    [/privilege escalation/, "Privilege Escalation"],
    [/information disclosure|exposure of sensitive/, "Information Disclosure"],
    [/denial of service/, "Service Disruption"],
  ];
  for (const [re, label] of pairs) if (re.test(t)) return label;
  return f.cwes[0] ?? "Unclassified";
}
