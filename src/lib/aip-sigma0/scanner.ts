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
  flags: AipFlag[];
}

const REPORTER =
  /\b\d{1,3}\s+(?:U\.S\.|S\.\s*Ct\.|F\.(?:2d|3d|4th)|F\.\s*Supp\.(?:\s*2d|\s*3d)?)\s+\d{1,4}\b/g;
const PERCENT = /\b\d{1,3}(?:\.\d+)?%\b/g;
const WEASEL =
  /\b(?:studies show|research (?:shows|proves|suggests)|scientists say|experts agree|it is well[- ]known|according to (?:experts|scientists|reports))\b/gi;
const URL = /\bhttps?:\/\/[^\s)>\]]+/gi;
const QUOTE = /[“"]([^”"]{12,180})[”"]/g;
const CASE_NAME =
  /\b[A-Z][A-Za-z.'-]{1,24}(?:\s+[A-Z][A-Za-z.'-]{1,24}){0,3}\s+v\.\s+[A-Z][A-Za-z.'-]{1,24}(?:\s+[A-Z][A-Za-z.'-]{1,24}){0,3}\b/g;
const YEAR_FACT = /\bas of (?:19|20)\d{2}\b/gi;

function collect(re: RegExp, text: string): string[] {
  const out: string[] = [];
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = copy.exec(text))) {
    const span = m[0].trim();
    if (span && !out.includes(span)) out.push(span);
  }
  return out;
}

function inAnchors(span: string, hay: string): boolean {
  return hay.includes(span.toLowerCase());
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

  for (const span of collect(REPORTER, text)) {
    push("invented_citation", "high", span, "Reporter-style citation must appear in supplied anchors or a tool receipt.");
  }
  for (const span of collect(PERCENT, text)) {
    push("unsourced_statistic", "high", span, "Numeric rate or percent needs a source in the brief or a retrieved hit.");
  }
  for (const span of collect(WEASEL, text)) {
    push("weasel_authority", "medium", span, "Vague appeal to authority with no named source.");
  }
  for (const span of collect(URL, text)) {
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

  const ungrounded = flags.filter((f) => !f.grounded);
  const highCount = ungrounded.filter((f) => f.severity === "high").length;
  const mediumCount = ungrounded.filter((f) => f.severity === "medium").length;

  return {
    protocol: "AIP-Σ0",
    simulated: false,
    verdict: highCount === 0 ? "pass" : "review",
    highCount,
    mediumCount,
    flags: ungrounded,
  };
}

export function formatScanFooter(scan: AipScan): string {
  const head = `AIP-Σ0 ${scan.verdict.toUpperCase()} · high ${scan.highCount} · medium ${scan.mediumCount} · real scan (not simulated)`;
  if (!scan.flags.length) return head;
  const lines = scan.flags.slice(0, 8).map((f) => `- [${f.severity}] ${f.kind}: ${f.span}`);
  return [head, ...lines].join("\n");
}
