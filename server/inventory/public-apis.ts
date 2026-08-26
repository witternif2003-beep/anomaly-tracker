import type { LegalHit } from "../legal/types";
import { hasPaidCredential, searchCourtListenerFree, searchGooglePatents } from "../free-api-resolve";

async function fetchText(
  url: string,
  timeoutMs = 8000,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json,text/csv,text/plain,*/*", "User-Agent": "LyraLocal/0.1", ...extraHeaders },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchEdgar(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const url = new URL("https://efts.sec.gov/LATEST/search-index");
  url.searchParams.set("q", query);
  url.searchParams.set("dateRange", "custom");
  url.searchParams.set("startdt", "2020-01-01");
  url.searchParams.set("enddt", "2030-01-01");
  const { ok, status, body } = await fetchText(url.toString());
  if (!ok) return { hits: [], warning: `SEC EDGAR HTTP ${status || "unreachable"}` };
  try {
    const parsed = JSON.parse(body) as {
      hits?: {
        hits?: Array<{
          _id?: string;
          _source?: { entity?: string; file_type?: string; file_date?: string; display_names?: string[] };
        }>;
      };
    };
    const rows = parsed.hits?.hits ?? [];
    const hits = rows.slice(0, limit).map((row, i) => ({
      source: "edgar" as const,
      id: String(row._id ?? `edgar-${i}`),
      title: row._source?.display_names?.[0] || row._source?.entity || "SEC filing",
      date: row._source?.file_date,
      snippet: `${row._source?.file_type ?? "filing"} from SEC EDGAR full-text search.`,
    }));
    return { hits };
  } catch {
    return { hits: [], warning: "SEC EDGAR response was not JSON" };
  }
}

export async function searchOfac(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const { ok, status, body } = await fetchText("https://www.treasury.gov/ofac/downloads/sdn.csv", 12000);
  if (!ok) return { hits: [], warning: `OFAC SDN HTTP ${status || "unreachable"}` };
  const needle = query.toLowerCase();
  const lines = body.split(/\r?\n/).filter((line) => line.toLowerCase().includes(needle)).slice(0, limit);
  const hits = lines.map((line, i) => ({
    source: "ofac" as const,
    id: `ofac-${i}`,
    title: line.split(",")[1] || line.slice(0, 80),
    snippet: line.slice(0, 280),
    citation: "OFAC SDN list (treasury.gov)",
  }));
  return { hits, warning: hits.length ? undefined : "No OFAC SDN row matched." };
}

export async function searchFinra(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const key = process.env.FINRA_API_KEY?.trim();
  const url = new URL("https://api.finra.org/data/group/otcMarket/name/weeklySummary");
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 5), 20)));
  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasPaidCredential(key)) headers.Authorization = `Bearer ${key}`;
  const { ok, status, body } = await fetchText(url.toString(), 8000, headers);
  if (!ok) {
    const edgar = await searchEdgar(query, limit);
    return {
      hits: edgar.hits.map((h) => ({
        ...h,
        source: "finra" as const,
        snippet: `${h.snippet} (FINRA free path via EDGAR)`,
      })),
      warning: edgar.hits.length
        ? `FINRA public dataset HTTP ${status}; served SEC EDGAR free fallback`
        : `FINRA TRACE HTTP ${status || "unreachable"} and EDGAR fallback empty`,
    };
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [];
    const needle = query.toLowerCase();
    const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
    const useRows = (filtered.length ? filtered : rows).slice(0, limit);
    const hits = useRows.map((row, i) => {
      const rec = row as Record<string, string | number | null>;
      return {
        source: "finra" as const,
        id: `finra-${i}`,
        title: String(
          rec.issueSymbolIdentifier || rec.symbolIdentifier || rec.issueSymbol || rec.tierIdentifier || "FINRA weekly summary",
        ),
        snippet: JSON.stringify(rec).slice(0, 220),
      };
    });
    if (hits.length) {
      return {
        hits,
        warning: filtered.length
          ? undefined
          : "FINRA public weeklySummary (no symbol match; returned latest aggregate rows)",
      };
    }
  } catch {
    // fall through to EDGAR
  }
  const edgar = await searchEdgar(query, limit);
  return {
    hits: edgar.hits.map((h) => ({
      ...h,
      source: "finra" as const,
      snippet: `${h.snippet} (FINRA free path via EDGAR)`,
    })),
    warning: edgar.hits.length
      ? "FINRA JSON parse/empty; served SEC EDGAR free fallback"
      : "FINRA and EDGAR free paths returned no rows",
  };
}

export async function searchUspto(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const key = process.env.USPTO_API_KEY?.trim();
  if (!hasPaidCredential(key)) {
    return searchGooglePatents(query, limit);
  }
  const url = new URL("https://developer.uspto.gov/ibd-api/v1/patent/application");
  url.searchParams.set("searchText", query);
  url.searchParams.set("rows", String(Math.min(limit, 20)));
  const { ok, status, body } = await fetchText(url.toString());
  if (!ok) {
    const free = await searchGooglePatents(query, limit);
    return {
      hits: free.hits,
      warning: free.warning ?? `USPTO portal HTTP ${status}; used Google Patents free path`,
    };
  }
  try {
    const parsed = JSON.parse(body) as {
      results?: Array<{
        inventionTitle?: string;
        patentNumber?: string;
        publicationDate?: string;
        abstractText?: string[];
      }>;
    };
    const hits = (parsed.results ?? []).slice(0, limit).map((row, i) => ({
      source: "uspto" as const,
      id: String(row.patentNumber ?? `uspto-${i}`),
      title: row.inventionTitle || "USPTO record",
      date: row.publicationDate,
      snippet: row.abstractText?.[0] || "USPTO patent application metadata.",
    }));
    return { hits };
  } catch {
    return searchGooglePatents(query, limit);
  }
}

export async function searchPacer(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const user = process.env.PACER_USERNAME?.trim();
  const pass = process.env.PACER_PASSWORD?.trim();
  if (hasPaidCredential(user) || hasPaidCredential(pass)) {
    return {
      hits: [],
      warning:
        "PACER credentials are present but this studio does not open a live PACER session (CM/ECF login is agency-specific).",
    };
  }
  const free = await searchCourtListenerFree(query, limit, "pacer", "r");
  return {
    hits: free.hits,
    warning: free.warning ?? "PACER resolved via free CourtListener RECAP (no CM/ECF session)",
  };
}
