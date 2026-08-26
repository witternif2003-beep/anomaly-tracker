import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LegalHit } from "./legal/types";
import resolutionsDoc from "../data/anomaly/free-api-resolutions.json";

export type FreeResolutionName = keyof typeof resolutionsDoc.resolutions;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const FREE_API_RESOLUTIONS = resolutionsDoc.resolutions;

export function isFreeResolutionValue(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (v.startsWith("free:")) return true;
  if (v.startsWith("sqlite:")) return true;
  if (v.startsWith("file:")) return true;
  // Public FBI CDE ORI demo — not a secret
  if (/^[A-Z]{2}\d{7}$/.test(v)) return true;
  return false;
}

export function hasPaidCredential(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  return Boolean(v) && !isFreeResolutionValue(v);
}

/** Fill every empty research placeholder with a free public-tool sentinel. Never overwrites real secrets. */
export function applyFreeApiDefaults(root = ROOT): void {
  for (const [name, meta] of Object.entries(FREE_API_RESOLUTIONS)) {
    const current = process.env[name]?.trim();
    if (current) continue;
    process.env[name] = meta.sentinel;
  }

  if (!process.env.DATABASE_URL?.trim() && process.env.DATABASE_URI?.trim()) {
    process.env.DATABASE_URL = process.env.DATABASE_URI;
  }

  ensureSqlitePlaceholder(root);
}

function ensureSqlitePlaceholder(root: string): void {
  const uri = process.env.DATABASE_URI?.trim() ?? "";
  if (!uri.startsWith("sqlite:") && !uri.startsWith("file:")) return;
  const rel = uri.replace(/^sqlite:/, "").replace(/^file:/, "");
  const filePath = path.isAbsolute(rel) ? rel : path.join(root, rel);
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (!existsSync(filePath)) {
    writeFileSync(filePath, "");
  }
}

export function freeApiResolutionStatus() {
  applyFreeApiDefaults();
  const variables = Object.entries(FREE_API_RESOLUTIONS).map(([name, meta]) => {
    const value = process.env[name]?.trim() ?? "";
    return {
      name,
      configured: Boolean(value),
      freeResolved: isFreeResolutionValue(value),
      tool: meta.tool,
      endpoint: meta.endpoint,
      replaces: meta.replaces,
      cost: meta.cost,
      liveQueries: "liveQueries" in meta ? Boolean(meta.liveQueries) : undefined,
    };
  });
  return {
    object: "env.free-api-resolutions" as const,
    title: resolutionsDoc.title,
    note: resolutionsDoc.note,
    allResolved: variables.every((v) => v.configured),
    freeCount: variables.filter((v) => v.freeResolved).length,
    variables,
  };
}

async function fetchText(
  url: string,
  timeoutMs = 10000,
  headers: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "LyraLocal/0.1 (free-api)", ...headers },
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(
  url: string,
  timeoutMs = 10000,
  headers: Record<string, string> = {},
  init?: { method?: string; body?: string },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const { ok, status, body } = await fetchText(url, timeoutMs, {
    Accept: "application/json",
    ...headers,
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  });
  if (!ok) return { ok, status, body: null };
  try {
    return { ok, status, body: JSON.parse(body) };
  } catch {
    return { ok: false, status, body: null };
  }
}

/** CourtListener opinions — free Westlaw / OpenLaws / Lexis substitute. */
export async function searchCourtListenerFree(
  query: string,
  limit: number,
  source: LegalHit["source"],
  type: "o" | "r" = "o",
): Promise<{ hits: LegalHit[]; warning?: string }> {
  const url = new URL("https://www.courtlistener.com/api/rest/v4/search/");
  url.searchParams.set("q", query);
  url.searchParams.set("type", type);
  url.searchParams.set("page_size", String(Math.min(limit, 20)));
  const token = process.env.COURTLISTENER_TOKEN?.trim();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token && !isFreeResolutionValue(token)) headers.Authorization = `Token ${token}`;
  const { ok, status, body } = await fetchJson(url.toString(), 10000, headers);
  if (!ok || !body) {
    return { hits: [], warning: `CourtListener free stack HTTP ${status || "unreachable"}` };
  }
  const rows = ((body as { results?: Array<Record<string, unknown>> }).results ?? []).slice(0, limit);
  const hits = rows.map((row, i) => ({
    source,
    id: String(row.id ?? row.cluster_id ?? `${source}-${i}`),
    title: String(row.caseName || row.caseNameFull || row.absolute_url || `${source} hit`),
    court: row.court || row.court_citation_string ? String(row.court || row.court_citation_string) : undefined,
    date: row.dateFiled || row.date_filed ? String(row.dateFiled || row.date_filed) : undefined,
    snippet: String(
      row.snippet || row.snippet_or_preview || row.docketNumber || "CourtListener free public result",
    ).slice(0, 400),
    url: row.absolute_url
      ? String(row.absolute_url).startsWith("http")
        ? String(row.absolute_url)
        : `https://www.courtlistener.com${String(row.absolute_url)}`
      : undefined,
    citation: Array.isArray(row.citation)
      ? String(row.citation[0] ?? "")
      : row.citation || row.cite
        ? String(row.citation || row.cite)
        : undefined,
  }));
  return {
    hits,
    warning: hits.length
      ? undefined
      : `No CourtListener hits for ${JSON.stringify(query)} (free ${source} path)`,
  };
}

/** Jina Reader — free Firecrawl substitute. */
export async function fetchViaJina(targetUrl: string): Promise<{
  ok: boolean;
  status: number;
  markdown: string;
  tool: string;
}> {
  const target = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;
  const { ok, status, body } = await fetchText(`https://r.jina.ai/${target}`, 15000, {
    Accept: "text/plain",
  });
  return { ok, status, markdown: body.slice(0, 50_000), tool: "jina-reader" };
}

/** npms.io + jsDelivr — free Context7 docs substitute. */
export async function searchFreeDocs(query: string, limit = 5): Promise<{
  hits: Array<{ name: string; version?: string; description?: string; docsUrl?: string; readmePreview?: string }>;
  warning?: string;
  tool: string;
}> {
  const url = new URL("https://api.npms.io/v2/search");
  url.searchParams.set("q", query);
  url.searchParams.set("size", String(Math.min(limit, 10)));
  const { ok, status, body } = await fetchJson(url.toString());
  if (!ok || !body) {
    return { hits: [], warning: `npms.io HTTP ${status || "unreachable"}`, tool: "npms+jsdelivr" };
  }
  const results = ((body as { results?: Array<{ package?: Record<string, unknown> }> }).results ?? []).slice(
    0,
    limit,
  );
  const hits = [];
  for (const row of results) {
    const pkg = row.package ?? {};
    const name = String(pkg.name || "unknown");
    const version = pkg.version ? String(pkg.version) : undefined;
    let readmePreview: string | undefined;
    if (name && version) {
      const readmeUrl = `https://cdn.jsdelivr.net/npm/${name}@${version}/README.md`;
      const readme = await fetchText(readmeUrl, 8000);
      if (readme.ok) readmePreview = readme.body.slice(0, 600);
    }
    const links = (pkg.links ?? {}) as Record<string, string>;
    hits.push({
      name,
      version,
      description: pkg.description ? String(pkg.description) : undefined,
      docsUrl: links.homepage || links.npm || `https://www.npmjs.com/package/${name}`,
      readmePreview,
    });
  }
  return { hits, tool: "npms+jsdelivr" };
}

/** Google Patents XHR — free USPTO substitute (no API key). */
export async function searchGooglePatents(
  query: string,
  limit: number,
): Promise<{ hits: LegalHit[]; warning?: string }> {
  const url = new URL("https://patents.google.com/xhr/query");
  url.searchParams.set("url", `q=${encodeURIComponent(query)}`);
  url.searchParams.set("exp", "");
  const { ok, status, body } = await fetchJson(url.toString(), 12000, {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 LyraLocal/0.1",
  });
  if (!ok || !body) {
    return { hits: [], warning: `Google Patents free stack HTTP ${status || "unreachable"}` };
  }
  const cluster = (body as { results?: { cluster?: Array<{ result?: Array<Record<string, unknown>> }> } }).results
    ?.cluster?.[0]?.result;
  const rows = (cluster ?? []).slice(0, limit);
  const hits: LegalHit[] = rows.map((row, i) => {
    const patent = (row.patent ?? row) as Record<string, string>;
    const id = String(row.id ?? patent.publication_number ?? `uspto-free-${i}`);
    return {
      source: "uspto" as const,
      id,
      title: patent.title || "Patent result",
      date: patent.publication_date || patent.priority_date,
      snippet: (patent.snippet || patent.abstract || "Google Patents free public result").replace(/<[^>]+>/g, "").slice(0, 400),
      url: id.startsWith("patent/") ? `https://patents.google.com/${id}` : `https://patents.google.com/patent/${id}`,
      citation: patent.publication_number,
    };
  });
  return {
    hits,
    warning: hits.length ? undefined : "No Google Patents hits (free USPTO path)",
  };
}

/** FBI Crime Data Explorer — free UCR typology (never NCIC live). */
export async function fetchFbiCdeAgencies(stateAbbr = "CA"): Promise<{
  ok: boolean;
  agencies: Array<{ ori: string; agency_name: string; state_abbr: string }>;
  warning?: string;
  tool: string;
}> {
  const key = process.env.DATA_GOV_API_KEY?.trim() || "DEMO_KEY";
  const url = `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/${encodeURIComponent(stateAbbr)}?API_KEY=${encodeURIComponent(key)}`;
  const { ok, status, body } = await fetchJson(url.toString(), 12000);
  if (!ok || !body || typeof body !== "object") {
    return { ok: false, agencies: [], warning: `FBI CDE HTTP ${status || "unreachable"}`, tool: "fbi-cde" };
  }
  const agencies: Array<{ ori: string; agency_name: string; state_abbr: string }> = [];
  for (const rows of Object.values(body as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const rec = row as { ori?: string; agency_name?: string; state_abbr?: string };
      if (rec.ori) {
        agencies.push({
          ori: rec.ori,
          agency_name: rec.agency_name || "Agency",
          state_abbr: rec.state_abbr || stateAbbr,
        });
      }
    }
  }
  return { ok: true, agencies: agencies.slice(0, 50), tool: "fbi-cde" };
}

export function freeResolutionMeta(name: string) {
  return FREE_API_RESOLUTIONS[name as FreeResolutionName] ?? null;
}

/** For tests / notebooks — list resolutions from the committed JSON. */
export function listFreeResolutionsFromDisk(root = ROOT) {
  const file = path.join(root, "data/anomaly/free-api-resolutions.json");
  return JSON.parse(readFileSync(file, "utf8")) as typeof resolutionsDoc;
}
