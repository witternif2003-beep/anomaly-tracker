import { searchCongress, searchGovInfo, searchLexisNexis, searchOpenLaws, searchWestlaw, legalSourceStatus } from "./legal/clients";
import { searchFre } from "./legal/fre";
import { searchGlossary } from "./legal/glossary";
import type { LegalHit, LegalSearchResult, LegalSource } from "./legal/types";
import { searchP1, type P1Slot } from "./p1-catalog";

export type { LegalHit, LegalSearchResult, LegalSource };

const DEFAULT_SOURCES: LegalSource[] = ["folio", "glossary", "courtlistener", "fre", "p1"];

interface FolioDoc {
  id: string;
  title: string;
  topic: string;
  body: string;
  tags: string[];
}

const FOLIO_DOCS: FolioDoc[] = [
  {
    id: "folio-qi-01",
    title: "Qualified immunity — two-prong sequence",
    topic: "Qualified immunity",
    tags: ["§1983", "clearly established", "Pearson"],
    body: "Pearson v. Callahan lets courts take the prongs in either order: (1) constitutional violation and (2) clearly established law at the time. Clearly established requires a robust consensus of persuasive authority or a square holding, not a high-level abstraction.",
  },
  {
    id: "folio-twombly-01",
    title: "Pleading plausibility after Twombly/Iqbal",
    topic: "Civil procedure",
    tags: ["Rule 12(b)(6)", "plausibility", "conclusory"],
    body: "A complaint must state a plausible claim, not merely a conceivable one. Courts strip conclusory recitals, then ask whether remaining facts allow a reasonable inference of liability. Threadbare labels of the elements do not suffice.",
  },
  {
    id: "folio-chevron-01",
    title: "Agency interpretation after Loper Bright",
    topic: "Administrative law",
    tags: ["Loper Bright", "Skidmore", "APA"],
    body: "Loper Bright overruled Chevron. Courts independently interpret statutes and may still give Skidmore respect to an agency view based on thoroughness, validity of reasoning, and consistency. APA arbitrary-and-capricious review of factfinding remains distinct.",
  },
  {
    id: "folio-bruen-01",
    title: "Second Amendment text-and-history test",
    topic: "Constitutional law",
    tags: ["Bruen", "Rahimi", "historical analogue"],
    body: "Bruen asks whether the Second Amendment’s plain text covers the conduct, then whether the government can show a historical analogue that is relevantly similar in why and how it burdened the right. Rahimi confirms analogues need not be twins.",
  },
  {
    id: "folio-daubert-01",
    title: "Expert reliability under Daubert/Rule 702",
    topic: "Evidence",
    tags: ["Daubert", "Rule 702", "gatekeeping"],
    body: "The court is gatekeeper for expert testimony: qualification, reliability of method, and fit. Rule 702 as amended emphasizes that the proponent must show it is more likely than not that the opinion is based on sufficient facts and reliable principles applied to the case.",
  },
  {
    id: "folio-celotex-01",
    title: "Summary judgment burdens (Celotex)",
    topic: "Civil procedure",
    tags: ["Rule 56", "Celotex", "Anderson"],
    body: "The movant may point to an absence of evidence on an essential element of the nonmovant’s case. The nonmovant must then produce specific facts showing a genuine dispute. Credibility is generally for the jury; mere scintilla is not enough.",
  },
  {
    id: "folio-miranda-01",
    title: "Custody plus interrogation",
    topic: "Criminal procedure",
    tags: ["Miranda", "custody", "public safety"],
    body: "Miranda warnings are required for custodial interrogation. Custody is an objective restraint on freedom of movement akin to formal arrest. The public-safety exception and booking questions are limited carve-outs. Invocation of counsel must be unambiguous.",
  },
  {
    id: "folio-copyright-01",
    title: "Fair use four factors",
    topic: "Copyright",
    tags: ["fair use", "transformative", "Warhol"],
    body: "Fair use weighs purpose and character (including transformation and commerciality), nature of the work, amount and substantiality, and market effect. Andy Warhol Foundation v. Goldsmith cautions against treating every new meaning as transformative when the use competes in a similar market.",
  },
  {
    id: "folio-class-01",
    title: "Rule 23(a)/(b) class certification",
    topic: "Class actions",
    tags: ["numerosity", "commonality", "predominance"],
    body: "Certification requires numerosity, commonality, typicality, and adequacy, plus a (b)(2) or (b)(3) path. Wal-Mart v. Dukes raised commonality. Comcast requires a damages model that fits the liability theory. Predominance fails when individual issues swamp common ones.",
  },
  {
    id: "folio-habeas-01",
    title: "AEDPA deference on federal habeas",
    topic: "Habeas corpus",
    tags: ["AEDPA", "2254(d)", "clearly established"],
    body: "A state-court merits decision may be disturbed only if it is contrary to, or an unreasonable application of, clearly established Supreme Court law, or based on an unreasonable determination of the facts. Fairminded disagreement means relief is unavailable.",
  },
  {
    id: "folio-standing-01",
    title: "Article III standing triad",
    topic: "Jurisdiction and venue",
    tags: ["injury in fact", "traceability", "redressability"],
    body: "Plaintiffs need a concrete and particularized injury, fairly traceable to the defendant, and likely redressable by a favorable decision. TransUnion requires concreteness analogized to historical harms for statutory violations. Organizations must show their own injury or valid associational standing.",
  },
  {
    id: "folio-injunction-01",
    title: "Winter preliminary-injunction factors",
    topic: "Injunctions",
    tags: ["Winter", "irreparable harm", "equity"],
    body: "A preliminary injunction requires likelihood of success, irreparable harm, balance of equities, and public interest. Winter rejected a mere possibility of irreparable harm. Mandatory injunctions altering the status quo draw extra scrutiny in many circuits.",
  },
];

function folioFromP1(): FolioDoc[] {
  return searchP1("", 96).map((slot, i) => ({
    id: `folio-p1-${slot.id}`,
    title: `FOLIO note: ${slot.practiceArea} / ${slot.folioTopic}`,
    topic: slot.practiceArea,
    tags: slot.tags,
    body: `Approved FOLIO ontology card ${i + 1} for ${slot.title}. Focus: ${slot.folioTopic}. Use this card to frame ${slot.workProduct.toLowerCase()} work in ${slot.jurisdiction}. Pair with CourtListener opinions on ${slot.courtlistenerQuery}.`,
  }));
}

const FOLIO_INDEX: FolioDoc[] = [...FOLIO_DOCS, ...folioFromP1()];

function scoreDoc(query: string, text: string): number {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  if (terms.length === 0) return 0;
  const hay = text.toLowerCase();
  return terms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
}

function searchFolio(query: string, limit: number): LegalHit[] {
  return FOLIO_INDEX.map((doc) => ({
    doc,
    score: scoreDoc(query, `${doc.title} ${doc.topic} ${doc.body} ${doc.tags.join(" ")}`),
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ doc }) => ({
      source: "folio" as const,
      id: doc.id,
      title: doc.title,
      snippet: doc.body,
      citation: doc.topic,
    }));
}

function p1Hits(query: string, limit: number): LegalHit[] {
  return searchP1(query, limit).map((slot: P1Slot) => ({
    source: "p1" as const,
    id: slot.id,
    title: slot.title,
    court: slot.jurisdiction,
    snippet: `${slot.workProduct} slot covering ${slot.folioTopic} in ${slot.practiceArea}.`,
  }));
}

interface CourtListenerResult {
  absolute_url?: string;
  caseName?: string;
  caseNameFull?: string;
  court?: string;
  dateFiled?: string;
  citation?: string[] | string;
  docketNumber?: string;
  syllabus?: string;
  opinions?: Array<{ snippet?: string }>;
}

async function searchCourtListener(query: string, limit: number): Promise<{ hits: LegalHit[]; warning?: string }> {
  const url = new URL("https://www.courtlistener.com/api/rest/v4/search/");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "o");
  url.searchParams.set("page_size", String(Math.min(Math.max(limit, 1), 20)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "LyraLocal/0.1 (local legal search; public CourtListener)",
    };
    const token = process.env.COURTLISTENER_TOKEN?.trim();
    if (token) headers.Authorization = `Token ${token}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) {
      return { hits: [], warning: `CourtListener HTTP ${res.status}` };
    }
    const body = (await res.json()) as { results?: CourtListenerResult[] };
    const hits = (body.results ?? []).slice(0, limit).map((row, i) => {
      const citation = Array.isArray(row.citation) ? row.citation[0] : row.citation;
      const snippet =
        row.opinions?.[0]?.snippet ||
        row.syllabus ||
        `${row.caseName ?? "Opinion"} (${row.court ?? "court"} ${row.dateFiled ?? ""}).`;
      return {
        source: "courtlistener" as const,
        id: `cl-${row.docketNumber ?? i}`,
        title: row.caseNameFull || row.caseName || "Untitled opinion",
        court: row.court,
        date: row.dateFiled,
        snippet: snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        url: row.absolute_url ? `https://www.courtlistener.com${row.absolute_url}` : undefined,
        citation,
      };
    });
    return { hits };
  } catch (error) {
    const message = error instanceof Error ? error.message : "CourtListener unavailable";
    return { hits: [], warning: message };
  } finally {
    clearTimeout(timer);
  }
}

function keyedSources(): LegalSource[] {
  const extra: LegalSource[] = [];
  if (process.env.OPENLAWS_API_KEY?.trim()) extra.push("openlaws");
  if (
    process.env.WESTLAW_USERNAME?.trim() ||
    process.env.WESTLAW_PASSWORD?.trim() ||
    process.env.WESTLAW_API_KEY?.trim() ||
    process.env.WESTLAW_CLIENT_ID?.trim()
  ) {
    extra.push("westlaw");
  }
  if (process.env.LEXISNEXIS_API_KEY?.trim() || process.env.LEXISNEXIS_CLIENT_ID?.trim()) {
    extra.push("lexisnexis");
  }
  return extra;
}

function normalizeSource(raw: string): LegalSource | "blacks" | null {
  const s = raw.toLowerCase().trim();
  if (s === "all") return null;
  if (s === "lexis" || s === "lexis-nexis") return "lexisnexis";
  if (s === "congress.gov" || s === "congressgov") return "congress";
  if (s === "govinfo.gov") return "govinfo";
  if (s === "open-laws") return "openlaws";
  if (s === "blacks" || s === "black's" || s.includes("black's law") || s === "bouvier" || s === "glossary") {
    return s === "glossary" || s === "bouvier" ? "glossary" : "blacks";
  }
  const known: LegalSource[] = [
    "folio",
    "courtlistener",
    "fre",
    "p1",
    "openlaws",
    "westlaw",
    "lexisnexis",
    "congress",
    "govinfo",
    "glossary",
  ];
  return known.includes(s as LegalSource) ? (s as LegalSource) : null;
}

export async function legalSearch(input: {
  query: string;
  sources?: string[];
  limit?: number;
}): Promise<LegalSearchResult> {
  const query = input.query.trim();
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 25);
  const warnings: string[] = [];
  const results: LegalHit[] = [];
  const raw = (input.sources?.length ? input.sources : [...DEFAULT_SOURCES, ...keyedSources()]).map((s) =>
    s.toLowerCase(),
  );

  const requested: LegalSource[] = [];
  if (raw.includes("all")) {
    requested.push(
      "folio",
      "courtlistener",
      "fre",
      "p1",
      "openlaws",
      "westlaw",
      "lexisnexis",
      "congress",
      "govinfo",
      "glossary",
    );
  }
  for (const item of raw) {
    if (item === "all") continue;
    const mapped = normalizeSource(item);
    if (mapped === "blacks") {
      warnings.push(
        "Black's Law Dictionary is copyrighted and is not installed. Using the public-domain glossary plus FOLIO.",
      );
      if (!requested.includes("glossary")) requested.push("glossary");
      if (!requested.includes("folio")) requested.push("folio");
      continue;
    }
    if (mapped && !requested.includes(mapped)) requested.push(mapped);
  }
  if (requested.length === 0) requested.push(...DEFAULT_SOURCES);

  if (!query) {
    return {
      object: "legal.search",
      query,
      sources: requested,
      count: 0,
      results: [],
      warnings: ["query is required"],
    };
  }

  const pushRemote = (hitSet: { hits: LegalHit[]; warning?: string }) => {
    results.push(...hitSet.hits);
    if (hitSet.warning) warnings.push(hitSet.warning);
  };

  if (requested.includes("folio")) results.push(...searchFolio(query, limit));
  if (requested.includes("p1")) results.push(...p1Hits(query, Math.min(limit, 6)));
  if (requested.includes("fre")) results.push(...searchFre(query, limit));
  if (requested.includes("glossary")) results.push(...searchGlossary(query, limit));
  if (requested.includes("courtlistener")) pushRemote(await searchCourtListener(query, limit));
  if (requested.includes("openlaws")) pushRemote(await searchOpenLaws(query, limit));
  if (requested.includes("westlaw")) pushRemote(await searchWestlaw(query, limit));
  if (requested.includes("lexisnexis")) pushRemote(await searchLexisNexis(query, limit));
  if (requested.includes("congress")) pushRemote(await searchCongress(query, limit));
  if (requested.includes("govinfo")) pushRemote(await searchGovInfo(query, limit));

  return {
    object: "legal.search",
    query,
    sources: requested,
    count: results.length,
    results,
    warnings,
  };
}

export function legalSearchStatus() {
  return legalSourceStatus();
}
