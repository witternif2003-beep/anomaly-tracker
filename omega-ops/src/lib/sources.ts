import { env } from "./env";

/** Public feeds the platform reads. Every stored field traces back to one of these. */
export const SOURCES = {
  kev: {
    id: "kev",
    label: "CISA Known Exploited Vulnerabilities catalog",
    url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  },
  nvd: {
    id: "nvd",
    label: "NVD CVE API 2.0",
    url: "https://services.nvd.nist.gov/rest/json/cves/2.0",
  },
  epss: {
    id: "epss",
    label: "FIRST EPSS API v1",
    url: "https://api.first.org/data/v1/epss",
  },
} as const;

const UA = "omega-ops/1.0 (+defensive vulnerability telemetry)";

async function getJson<T>(url: string, headers: Record<string, string> = {}, timeoutMs = 20_000): Promise<{ data: T; bytes: number }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctl.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}: ${text.slice(0, 200)}`);
    return { data: JSON.parse(text) as T, bytes: Buffer.byteLength(text) };
  } finally {
    clearTimeout(timer);
  }
}

export interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
  notes: string;
  cwes?: string[];
}

export interface KevCatalog {
  title: string;
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: KevEntry[];
}

export async function fetchKev(): Promise<{ catalog: KevCatalog; bytes: number }> {
  const { data, bytes } = await getJson<KevCatalog>(SOURCES.kev.url);
  return { catalog: data, bytes };
}

export interface NvdMetric {
  cvss: number | null;
  vector: string | null;
  severity: string | null;
  published: string | null;
  lastModified: string | null;
  description: string | null;
  cwes: string[];
  vulnStatus: string | null;
  exploitability: number | null;
  impact: number | null;
  version: string | null;
  references: number | null;
}

interface NvdCve {
  id: string;
  published?: string;
  lastModified?: string;
  vulnStatus?: string;
  descriptions?: { lang: string; value: string }[];
  metrics?: Record<string, { source: string; type: string; exploitabilityScore?: number; impactScore?: number; cvssData?: { version?: string; baseScore?: number; vectorString?: string; baseSeverity?: string } }[]>;
  weaknesses?: { description?: { lang: string; value: string }[] }[];
  references?: { url: string }[];
}

interface Cvss {
  score: number | null;
  vector: string | null;
  severity: string | null;
  exploitability: number | null;
  impact: number | null;
  version: string | null;
}

function pickCvss(cve: NvdCve): Cvss {
  const order = ["cvssMetricV40", "cvssMetricV31", "cvssMetricV30", "cvssMetricV2"];
  for (const key of order) {
    const list = cve.metrics?.[key];
    if (!list?.length) continue;
    const primary = list.find((m) => m.type === "Primary") ?? list[0];
    const d = primary.cvssData;
    if (d?.baseScore != null) {
      return {
        score: d.baseScore,
        vector: d.vectorString ?? null,
        severity: d.baseSeverity ?? null,
        exploitability: primary.exploitabilityScore ?? null,
        impact: primary.impactScore ?? null,
        version: d.version ?? null,
      };
    }
  }
  return { score: null, vector: null, severity: null, exploitability: null, impact: null, version: null };
}

function toMetric(cve: NvdCve): NvdMetric {
  const c = pickCvss(cve);
  return {
    cvss: c.score,
    vector: c.vector,
    severity: c.severity,
    published: cve.published ?? null,
    lastModified: cve.lastModified ?? null,
    description: cve.descriptions?.find((d) => d.lang === "en")?.value ?? null,
    cwes: (cve.weaknesses ?? []).flatMap((w) => (w.description ?? []).map((d) => d.value)).filter((v) => v.startsWith("CWE-")),
    vulnStatus: cve.vulnStatus ?? null,
    exploitability: c.exploitability,
    impact: c.impact,
    version: c.version,
    references: cve.references?.length ?? null,
  };
}

const nvdHeaders = (): Record<string, string> => (env.nvdApiKey ? { apiKey: env.nvdApiKey } : {});

/**
 * The most recently modified CVE records inside the window. One count request, then the
 * newest page only, so a batch stays inside a serverless time budget.
 */
export async function fetchNvdWindow(startIso: string, endIso: string, pageSize = 100): Promise<{ metrics: Map<string, NvdMetric>; total: number; bytes: number; pages: number }> {
  const base = `${SOURCES.nvd.url}?lastModStartDate=${encodeURIComponent(startIso)}&lastModEndDate=${encodeURIComponent(endIso)}`;
  const head = await getJson<{ totalResults: number }>(`${base}&resultsPerPage=1`, nvdHeaders(), 10_000);
  const total = head.data.totalResults;
  const metrics = new Map<string, NvdMetric>();
  if (!total) return { metrics, total, bytes: head.bytes, pages: 1 };
  const startIndex = Math.max(0, total - pageSize);
  const { data, bytes } = await getJson<{ vulnerabilities: { cve: NvdCve }[] }>(`${base}&resultsPerPage=${pageSize}&startIndex=${startIndex}`, nvdHeaders());
  for (const v of data.vulnerabilities ?? []) metrics.set(v.cve.id, toMetric(v.cve));
  return { metrics, total, bytes: head.bytes + bytes, pages: 2 };
}

/** Exact CVE lookups, issued concurrently; failures are counted, not fatal. */
export async function fetchNvdByIds(ids: string[]): Promise<{ metrics: Map<string, NvdMetric>; bytes: number; requests: number; failed: number }> {
  const metrics = new Map<string, NvdMetric>();
  let bytes = 0;
  const results = await Promise.allSettled(ids.map((id) => getJson<{ vulnerabilities: { cve: NvdCve }[] }>(`${SOURCES.nvd.url}?cveId=${encodeURIComponent(id)}`, nvdHeaders(), 15_000)));
  let failed = 0;
  for (const r of results) {
    if (r.status === "rejected") {
      failed += 1;
      continue;
    }
    bytes += r.value.bytes;
    for (const v of r.value.data.vulnerabilities ?? []) metrics.set(v.cve.id, toMetric(v.cve));
  }
  return { metrics, bytes, requests: ids.length, failed };
}

export interface EpssScore {
  epss: number;
  percentile: number;
  date: string;
}

export async function fetchEpss(cves: string[]): Promise<{ scores: Map<string, EpssScore>; bytes: number; requests: number }> {
  const scores = new Map<string, EpssScore>();
  let bytes = 0;
  let requests = 0;
  for (let i = 0; i < cves.length; i += 100) {
    const chunk = cves.slice(i, i + 100);
    if (!chunk.length) break;
    const { data, bytes: b } = await getJson<{ data: { cve: string; epss: string; percentile: string; date: string }[] }>(`${SOURCES.epss.url}?cve=${chunk.join(",")}`);
    bytes += b;
    requests += 1;
    for (const row of data.data ?? []) scores.set(row.cve, { epss: Number(row.epss), percentile: Number(row.percentile), date: row.date });
  }
  return { scores, bytes, requests };
}

/** Catalogued exploitation × predicted exploitation × impact, on a 0-100 scale. */
export function exposureScore(input: { kevListed: boolean; epss: number | null; cvss: number | null; ransomware: string | null }): number {
  const epss = input.epss ?? 0;
  const cvss = input.cvss ?? 0;
  const base = 40 * epss + 4 * cvss;
  const listed = input.kevListed ? 15 : 0;
  const ransom = input.ransomware?.toLowerCase() === "known" ? 5 : 0;
  return Math.round(Math.min(100, base + listed + ransom) * 100) / 100;
}
