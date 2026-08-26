import type { LegalHit } from "./types";

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 8000,
  init?: { method?: string; body?: string },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      method: init?.method ?? "GET",
      body: init?.body,
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: { error: error instanceof Error ? error.message : String(error) } };
  } finally {
    clearTimeout(timer);
  }
}

export async function searchOpenLaws(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const key = process.env.OPENLAWS_API_KEY?.trim();
  if (!key) {
    return { hits: [], warning: "OpenLaws wired, awaiting OPENLAWS_API_KEY" };
  }
  const endpoint = process.env.OPENLAWS_ENDPOINT?.trim() || "https://api.openlaws.com/v1/search";
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const { ok, status, body } = await fetchJson(url.toString(), {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
    "User-Agent": "LyraLocal/0.1",
  });
  if (!ok) {
    return { hits: [], warning: `OpenLaws HTTP ${status || "unreachable"} (key present)` };
  }
  const rows = Array.isArray((body as { results?: unknown }).results)
    ? ((body as { results: Array<Record<string, string>> }).results)
    : [];
  const hits = rows.slice(0, limit).map((row, i) => ({
    source: "openlaws" as const,
    id: String(row.id ?? `ol-${i}`),
    title: row.title || row.name || "OpenLaws result",
    snippet: row.snippet || row.summary || "",
    url: row.url,
    citation: row.citation,
  }));
  return { hits };
}

export async function searchWestlaw(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const username = process.env.WESTLAW_USERNAME?.trim();
  const password = process.env.WESTLAW_PASSWORD?.trim();
  const id = process.env.WESTLAW_CLIENT_ID?.trim();
  const secret = process.env.WESTLAW_CLIENT_SECRET?.trim();
  const key = process.env.WESTLAW_API_KEY?.trim();
  if (!username && !password && !id && !secret && !key) {
    return {
      hits: [],
      warning:
        "Westlaw wired, contract required (WESTLAW_USERNAME / WESTLAW_PASSWORD; closest API aliases WESTLAW_CLIENT_ID / WESTLAW_CLIENT_SECRET / WESTLAW_API_KEY)",
    };
  }
  const endpoint = process.env.WESTLAW_ENDPOINT?.trim() || "https://api.thomsonreuters.com/search";
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const basic =
    username || password
      ? Buffer.from(`${username ?? ""}:${password ?? ""}`).toString("base64")
      : Buffer.from(`${id}:${secret}`).toString("base64");
  const { ok, status } = await fetchJson(url.toString(), {
    Accept: "application/json",
    Authorization: key ? `Bearer ${key}` : `Basic ${basic}`,
    "User-Agent": "LyraLocal/0.1",
  });
  if (!ok) {
    return { hits: [], warning: `Westlaw HTTP ${status || "unreachable"} (credentials present; contract endpoint)` };
  }
  return { hits: [] };
}

export async function searchLexisNexis(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const id = process.env.LEXISNEXIS_CLIENT_ID?.trim();
  const secret = process.env.LEXISNEXIS_CLIENT_SECRET?.trim();
  const key = process.env.LEXISNEXIS_API_KEY?.trim();
  if (!id && !secret && !key) {
    return { hits: [], warning: "LexisNexis wired, dev portal needed (LEXISNEXIS_CLIENT_ID / LEXISNEXIS_CLIENT_SECRET / LEXISNEXIS_API_KEY)" };
  }
  const endpoint = process.env.LEXISNEXIS_ENDPOINT?.trim() || "https://services-api.lexisnexis.com/v1/search";
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const { ok, status } = await fetchJson(url.toString(), {
    Accept: "application/json",
    Authorization: key ? `Bearer ${key}` : `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
    "User-Agent": "LyraLocal/0.1",
  });
  if (!ok) {
    return { hits: [], warning: `LexisNexis HTTP ${status || "unreachable"} (credentials present; portal endpoint)` };
  }
  return { hits: [] };
}

interface CongressBill {
  title?: string;
  number?: string;
  type?: string;
  congress?: number;
  latestAction?: { text?: string; actionDate?: string };
  url?: string;
}

export async function searchCongress(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const key = process.env.CONGRESS_GOV_API_KEY?.trim() || process.env.GOVINFO_API_KEY?.trim();
  const url = new URL("https://api.congress.gov/v3/bill");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(Math.min(limit, 20)));
  url.searchParams.set("format", "json");
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "LyraLocal/0.1 (Congress.gov optional key)",
  };
  if (key) headers["X-Api-Key"] = key;
  const { ok, status, body } = await fetchJson(url.toString(), headers);
  if (!ok) {
    return {
      hits: [],
      warning: key
        ? `Congress.gov HTTP ${status}`
        : `Congress.gov HTTP ${status} (optional CONGRESS_GOV_API_KEY)`,
    };
  }
  const bills = ((body as { bills?: CongressBill[] }).bills ?? []).slice(0, limit);
  const hits = bills.map((bill, i) => ({
    source: "congress" as const,
    id: `congress-${bill.congress ?? "x"}-${bill.type ?? "bill"}-${bill.number ?? i}`,
    title: bill.title || `${bill.type ?? "Bill"} ${bill.number ?? ""}`,
    date: bill.latestAction?.actionDate,
    snippet: bill.latestAction?.text || "Congressional bill metadata from api.congress.gov.",
    url: bill.url,
    citation: bill.number ? `${bill.type ?? ""} ${bill.number}`.trim() : undefined,
  }));
  return { hits };
}

interface GovInfoPackage {
  title?: string;
  packageId?: string;
  dateIssued?: string;
  governmentAuthor?: string[] | string;
  download?: { pdfLink?: string };
}

export async function searchGovInfo(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const key = process.env.GOVINFO_API_KEY?.trim() || process.env.CONGRESS_GOV_API_KEY?.trim();
  const url = new URL("https://api.govinfo.gov/search");
  if (key) url.searchParams.set("api_key", key);
  const { ok, status, body } = await fetchJson(
    url.toString(),
    {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "LyraLocal/0.1 (GovInfo; govinfo PyPI needs Python 3.13, using REST)",
    },
    8000,
    {
      method: "POST",
      body: JSON.stringify({ query, pageSize: Math.min(limit, 20), offsetMark: "*" }),
    },
  );
  if (!ok) {
    return {
      hits: [],
      warning: key ? `GovInfo HTTP ${status}` : `GovInfo HTTP ${status} (optional GOVINFO_API_KEY)`,
    };
  }
  const results = ((body as { results?: GovInfoPackage[] }).results ?? []).slice(0, limit);
  const hits = results.map((row, i) => ({
    source: "govinfo" as const,
    id: String(row.packageId ?? `govinfo-${i}`),
    title: row.title || "GovInfo package",
    date: row.dateIssued,
    snippet: Array.isArray(row.governmentAuthor)
      ? row.governmentAuthor.join(", ")
      : row.governmentAuthor || "GPO GovInfo collection",
    url: row.download?.pdfLink,
  }));
  return { hits };
}

export function legalSourceStatus() {
  const present = (name: string) => Boolean(process.env[name]?.trim());
  return [
    { id: "glossary", name: "Public-domain glossary (Black's workaround)", install: "data/legal/glossary.json + FOLIO", credentials: "none", status: "live", notes: "Black's Law Dictionary is copyrighted. This glossary plus FOLIO is the installed workaround." },
    { id: "folio", name: "FOLIO Ontology", install: "npm i -g folio-mcp@0.4.1", credentials: "none", status: "live", notes: "CC-BY local cards; remote pulls need folio login." },
    { id: "courtlistener", name: "CourtListener", install: "pip install court-listener (requested courtlistener is unpublished)", credentials: "optional COURTLISTENER_TOKEN", status: "live", notes: "Public REST v4; Python client installed as court-listener." },
    { id: "fre", name: "FRE excerpts", install: "data/legal/fre-excerpts.json", credentials: "none", status: "offline-fallback", notes: "Public-domain Federal Rules of Evidence excerpts." },
    { id: "openlaws", name: "OpenLaws", install: "REST client (pip openlaws unpublished; openlaw on PyPI is unrelated)", credentials: "OPENLAWS_API_KEY", status: present("OPENLAWS_API_KEY") ? "live" : "wired-awaiting-key" },
    { id: "westlaw", name: "Westlaw", install: "proprietary REST stub (no public SDK on PyPI)", credentials: "WESTLAW_USERNAME / WESTLAW_PASSWORD", status: present("WESTLAW_USERNAME") || present("WESTLAW_PASSWORD") || present("WESTLAW_API_KEY") || present("WESTLAW_CLIENT_ID") ? "live" : "wired-contract-required" },
    { id: "lexisnexis", name: "LexisNexis", install: "REST stub (no public SDK on PyPI)", credentials: "LEXISNEXIS_*", status: present("LEXISNEXIS_API_KEY") || present("LEXISNEXIS_CLIENT_ID") ? "live" : "wired-dev-portal-needed" },
    { id: "congress", name: "Congress.gov", install: "REST https://api.congress.gov (PyPI congress is alpha)", credentials: "optional CONGRESS_GOV_API_KEY", status: "optional" },
    { id: "govinfo", name: "GovInfo", install: "REST https://api.govinfo.gov (PyPI govinfo needs Python 3.13)", credentials: "optional GOVINFO_API_KEY", status: "optional" },
    { id: "edgar", name: "SEC EDGAR", install: "edgartools (pip sec-edgar is a stub; closest edgartools)", credentials: "none for public EFTS", status: "live" },
    { id: "finra", name: "FINRA TRACE", install: "REST api.finra.org", credentials: "optional FINRA_API_KEY", status: "optional" },
    { id: "ofac", name: "OFAC SDN", install: "curl treasury.gov/ofac/downloads/sdn.csv", credentials: "none (public list)", status: "live" },
    { id: "uspto", name: "USPTO patents", install: "developer.uspto.gov REST", credentials: "optional USPTO_API_KEY", status: "optional" },
    { id: "pacer", name: "PACER", install: "pacer-tools (pacer-client on PyPI is unrelated)", credentials: "PACER_USERNAME / PACER_PASSWORD", status: present("PACER_USERNAME") || present("PACER_PASSWORD") ? "wired-session-not-opened" : "wired-awaiting-key" },
    { id: "cjis", name: "CJIS / NCIC / federal", install: "placeholders only (not a CJIS-certified interface)", credentials: "CJIS_ORI / NCIC_ORI / NCIC_MNEMONIC", status: "applicable-placeholders", notes: "Live NCIC/III queries are refused." },
  ];
}
