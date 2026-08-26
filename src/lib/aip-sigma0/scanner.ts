export type AipSeverity = "high" | "medium";
export type AipFlagKind =
  | "invented_citation"
  | "unsourced_statistic"
  | "weasel_authority"
  | "unsourced_url"
  | "unattributed_quote"
  | "unsourced_case_name";

export interface AipFlag {
  kind: AipFlagKind;
  severity: AipSeverity;
  span: string;
  grounded: boolean;
  reason: string;
}

export interface AipScan {
  protocol: "AIP-Σ0";
  simulated: false;
  verdict: "pass" | "review";
  highCount: number;
  mediumCount: number;
  checkedCount: number;
  groundedCount: number;
  flags: AipFlag[];
}

const REPORTER =
  /\b\d{1,3}\s+(?:U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.(?:\s*2d)?|F\.(?:2d|3d|4th)|F\.\s*Supp\.(?:\s*2d|\s*3d)?)\s+\d{1,4}\b/g;
const USC = /\b\d{1,2}\s+U\.S\.C\.\s*§+\s*\d+[a-z0-9()-]*/gi;
const CFR = /\b\d{1,2}\s+C\.F\.R\.\s*§*\s*\d+(?:\.\d+)*/gi;
const FRCP = /\b(?:Fed\.\s*R\.\s*(?:Civ|Crim|App)\.\s*P\.|F\.R\.C\.P\.)\s*\d+[a-z]?/gi;
const FRE_RULE = /\b(?:FRE|Fed\.\s*R\.\s*Evid\.)\s*\d{3,4}\b/gi;
const PUB_L = /\bPub\.\s*L\.\s*No\.\s*\d+-\d+\b/gi;
// `%` is non-word, so a trailing `\b` never fires before space/punctuation.
const PERCENT = /\b\d{1,3}(?:\.\d+)?%/g;
const PERCENT_WORD = /\b\d{1,3}(?:\.\d+)?\s+per\s*cents?\b/gi;
const RATIO = /\b\d{1,3}\s+(?:out of|in)\s+\d{1,3}\b/gi;
const WEASEL =
  /\b(?:studies show|research (?:shows|proves|suggests)|scientists say|experts agree|it is well[- ]known|according to (?:experts|scientists|reports|a \d{4} study))\b/gi;
const URL = /\bhttps?:\/\/[^\s)>\]]+/gi;
const QUOTE = /[“"]([^”"]{12,180})[”"]/g;
const CASE_NAME =
  /\b[A-Z][A-Za-z.'-]{1,24}(?:\s+[A-Z][A-Za-z.'-]{1,24}){0,3}\s+v\.\s+[A-Z][A-Za-z.'-]{1,24}(?:\s+[A-Z][A-Za-z.'-]{1,24}){0,3}\b/g;
const YEAR_FACT = /\bas of (?:19|20)\d{2}\b/gi;

function collect(re: RegExp, text: string, tidy?: (span: string) => string): string[] {
  const out: string[] = [];
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = copy.exec(text))) {
    const raw = (m[1] ?? m[0]).trim();
    const span = tidy ? tidy(raw) : raw;
    if (span && !out.includes(span)) out.push(span);
  }
  return out;
}

function stripUrlPunct(span: string): string {
  return span.replace(/[.,;:]+$/g, "");
}

function inAnchors(span: string, hay: string): boolean {
  const needle = span.toLowerCase();
  if (hay.includes(needle)) return true;
  const noSlash = needle.replace(/\/+$/, "");
  return noSlash !== needle && hay.includes(noSlash);
}

export function scanText(text: string, anchors: string[] = []): AipScan {
  const hay = anchors.join("\n").toLowerCase();
  const flags: AipFlag[] = [];

  const push = (
    kind: AipFlagKind,
    severity: AipSeverity,
    span: string,
    reason: string,
  ) => {
    flags.push({
      kind,
      severity,
      span: span.slice(0, 180),
      grounded: inAnchors(span, hay),
      reason,
    });
  };

  for (const span of [
    ...collect(REPORTER, text),
    ...collect(USC, text),
    ...collect(CFR, text),
    ...collect(FRCP, text),
    ...collect(FRE_RULE, text),
    ...collect(PUB_L, text),
  ]) {
    push(
      "invented_citation",
      "high",
      span,
      "Reporter, code, rule, or public-law citation must appear in supplied anchors or a tool receipt.",
    );
  }
  for (const span of [...collect(PERCENT, text), ...collect(PERCENT_WORD, text)]) {
    push("unsourced_statistic", "high", span, "Numeric rate or percent needs a source in the brief or a retrieved hit.");
  }
  for (const span of collect(RATIO, text)) {
    push("unsourced_statistic", "medium", span, "Ratio or 'N out of M' claim needs a source.");
  }
  for (const span of collect(WEASEL, text)) {
    push("weasel_authority", "medium", span, "Vague appeal to authority with no named source.");
  }
  for (const span of collect(URL, text, stripUrlPunct)) {
    push("unsourced_url", "high", span, "URL must match an anchor or a retrieved hit.");
  }
  for (const span of collect(QUOTE, text)) {
    push("unattributed_quote", "medium", span, "Quoted language needs an attributed source in the anchors.");
  }
  for (const span of collect(CASE_NAME, text)) {
    push("unsourced_case_name", "high", span, "Case name must appear in the brief, glossary, or a legal-search receipt.");
  }
  for (const span of collect(YEAR_FACT, text)) {
    push("unsourced_statistic", "medium", span, "Time-bounded factual claim needs a source.");
  }

  const groundedCount = flags.filter((f) => f.grounded).length;
  const ungrounded = flags.filter((f) => !f.grounded);
  const highCount = ungrounded.filter((f) => f.severity === "high").length;
  const mediumCount = ungrounded.filter((f) => f.severity === "medium").length;

  return {
    protocol: "AIP-Σ0",
    simulated: false,
    verdict: ungrounded.length === 0 ? "pass" : "review",
    highCount,
    mediumCount,
    checkedCount: flags.length,
    groundedCount,
    flags: ungrounded,
  };
}

export function formatScanFooter(scan: AipScan): string {
  const head = `AIP-Σ0 ${scan.verdict.toUpperCase()} · high ${scan.highCount} · medium ${scan.mediumCount} · checked ${scan.checkedCount} · real scan (not simulated)`;
  if (!scan.flags.length) return head;
  const lines = scan.flags.slice(0, 8).map((f) => `- [${f.severity}] ${f.kind}: ${f.span}`);
  return [head, ...lines].join("\n");
}
