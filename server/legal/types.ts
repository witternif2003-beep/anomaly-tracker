export type LegalSource =
  | "folio"
  | "courtlistener"
  | "fre"
  | "p1"
  | "openlaws"
  | "westlaw"
  | "lexisnexis"
  | "congress"
  | "govinfo"
  | "glossary"
  | "edgar"
  | "ofac"
  | "finra"
  | "uspto"
  | "pacer"
  | "corporate";

export interface LegalHit {
  source: LegalSource;
  id: string;
  title: string;
  court?: string;
  date?: string;
  snippet: string;
  url?: string;
  citation?: string;
  receipt?: {
    protocol: "AIP-Σ0";
    kind: "tool-receipt";
    sha256: string;
  };
}

export interface LegalSearchResult {
  object: "legal.search";
  query: string;
  sources: string[];
  count: number;
  results: LegalHit[];
  warnings: string[];
  aip?: {
    protocol: "AIP-Σ0";
    simulated: false;
    receipts: number;
  };
}
