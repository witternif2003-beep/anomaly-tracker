export type LegalSource =
  | "folio"
  | "courtlistener"
  | "fre"
  | "p1"
  | "openlaws"
  | "westlaw"
  | "lexisnexis"
  | "congress"
  | "govinfo";

export interface LegalHit {
  source: LegalSource;
  id: string;
  title: string;
  court?: string;
  date?: string;
  snippet: string;
  url?: string;
  citation?: string;
}

export interface LegalSearchResult {
  object: "legal.search";
  query: string;
  sources: string[];
  count: number;
  results: LegalHit[];
  warnings: string[];
}
