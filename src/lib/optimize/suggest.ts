import { parseMode, type Mode } from "./types";
import { POSTDOC_BOT, POSTDOC_PROTOCOL } from "./postdoc";

export type SuggestionSeverity = "block" | "warn" | "hint";
export type SuggestionBand = "brief" | "postdoc" | "evidence";

export interface LiveSuggestion {
  id: string;
  severity: SuggestionSeverity;
  band: SuggestionBand;
  title: string;
  why: string;
  insert: string;
}

export interface SuggestionReport {
  object: "lyra.suggest";
  bot: typeof POSTDOC_BOT;
  protocol: typeof POSTDOC_PROTOCOL;
  hardcoded: true;
  simulated: false;
  live: true;
  mode: Mode;
  wordCount: number;
  fired: number;
  shown: number;
  suggestions: LiveSuggestion[];
  clear: boolean;
  idle: boolean;
}

interface SuggestCtx {
  text: string;
  words: number;
  mode: Mode;
  postdoc: boolean;
}

interface Rule {
  id: string;
  severity: SuggestionSeverity;
  band: SuggestionBand;
  title: string;
  why: string;
  insert: string;
  when: (ctx: SuggestCtx) => boolean;
}

const IDENTIFICATION =
  /\b(rct|randomized|difference-in-differences|\bdid\b|instrumental variable|\biv\b|regression discontinuity|\brd\b|matching|synthetic control|process tracing|saturation|identification|pre-register|preregister|grounded theor)\b/i;

const CORPUS =
  /\b(n\s*=|n=|sample of|dataset|corpus|archive|interviews?|survey|panel|acs |cps |census|years? \d{4}|from \d{4})\b/i;

const QUESTION =
  /\?|\b(research question|whether\b|does\b|do\b|how does|to what extent|under what conditions)\b/i;

const LIMITATIONS =
  /\b(limitation|external validity|selection|confound|measurement error|generaliz)\b/i;

const FALSIFIER =
  /\b(falsif|would reject|kill the claim|null result|disconfirm)\b/i;

const PRIOR_ART =
  /\b(prior art|literature|extends |builds on|author \(\d{4}\)|et al)\b/i;

const RULES: Rule[] = [
  {
    id: "too-short",
    severity: "block",
    band: "brief",
    title: "The brief is still a fragment",
    why: "Under 12 words there is no question, corpus, or bar — only a vibe.",
    insert:
      "Task: state the claim, the population, and what a finished answer must contain.",
    when: (c) => c.words > 0 && c.words < 12,
  },
  {
    id: "vague-quality",
    severity: "warn",
    band: "brief",
    title: "Soft quality words are standing in for a bar",
    why: "good / nice / best / exciting / novel (bare) cannot be checked.",
    insert:
      "Bar: a skeptical editor can run the result without asking what “good” meant. Cut intensifiers.",
    when: (c) =>
      c.words >= 8 &&
      /\b(good|nice|best|better|cool|awesome|exciting|interesting|make it pop)\b/i.test(c.text),
  },
  {
    id: "missing-audience",
    severity: "warn",
    band: "brief",
    title: "No audience — depth is undefined",
    why: "Without a reader, jargon level and what counts as obvious will drift.",
    insert:
      "Audience: methods-literate peers in this field, not a general blog reader.",
    when: (c) =>
      c.words >= 12 &&
      !/\b(audience|for (the )?(board|engineers?|students?|judges?|clients?|customers?|editors?|reviewers?|undergrad|grad students?|policymakers?))\b/i.test(
        c.text,
      ),
  },
  {
    id: "missing-format",
    severity: "hint",
    band: "brief",
    title: "No artifact shape",
    why: "The model will invent a blog post, a memo, or a slide dump at random.",
    insert:
      "Deliverable: 1,200-word methods memo with a one-page limitations appendix.",
    when: (c) =>
      c.words >= 12 &&
      !/\b(memo|paper|article|brief|email|json|table|outline|review|report|essay|slides?)\b/i.test(
        c.text,
      ),
  },
  {
    id: "help-me-generic",
    severity: "warn",
    band: "brief",
    title: "“Help me” is not a task",
    why: "A helper stance produces tutorials. Name the verb and the object.",
    insert: "Verb: draft / critique / identify — object: the claim and the design.",
    when: (c) => /\bhelp me\b/i.test(c.text),
  },
  {
    id: "stacked-tasks",
    severity: "hint",
    band: "brief",
    title: "Several tasks are jammed together",
    why: "Priority is missing, so the model will spend tokens on the easiest clause.",
    insert: "Priority: (1) research question, (2) identification, (3) everything else only if space remains.",
    when: (c) => c.words < 90 && (c.text.match(/\band\b/gi) ?? []).length > 3,
  },
  {
    id: "missing-research-question",
    severity: "block",
    band: "postdoc",
    title: "No falsifiable research question",
    why: "Post-doc mode needs one sentence a reviewer could reject.",
    insert:
      "Research question: Does X change Y among Z, holding W fixed? If that cannot be asked, say so.",
    when: (c) => c.postdoc && c.words >= 8 && !QUESTION.test(c.text),
  },
  {
    id: "causal-without-id",
    severity: "block",
    band: "postdoc",
    title: "Causal language without identification",
    why: "cause / impact / effect / prove without a design is a methods desk-reject.",
    insert:
      "Identification: name RCT, DID, IV, RD, process tracing, or write UNKNOWN and drop causal verbs.",
    when: (c) =>
      c.postdoc &&
      c.words >= 8 &&
      /\b(cause|causes|caused|impact|affect|effect|prove|proves|leads to|because of)\b/i.test(c.text) &&
      !IDENTIFICATION.test(c.text),
  },
  {
    id: "novel-without-prior-art",
    severity: "warn",
    band: "postdoc",
    title: "“Novel” / “first” without a search",
    why: "Priority claims without named prior art are advertising.",
    insert:
      "Contribution: extends [Author YEAR]. Search: [database + query]. Ban “first” until that search exists.",
    when: (c) =>
      c.postdoc &&
      /\b(novel|groundbreaking|first ever|the first|original contribution)\b/i.test(c.text) &&
      !PRIOR_ART.test(c.text),
  },
  {
    id: "missing-corpus",
    severity: "warn",
    band: "postdoc",
    title: "No corpus, N, or years",
    why: "Without data bounds the model will mint a convenient sample.",
    insert:
      "Corpus: source, years, N or qualitative stop rule, inclusion/exclusion. UNKNOWN if not in hand.",
    when: (c) => c.postdoc && c.words >= 12 && !CORPUS.test(c.text),
  },
  {
    id: "missing-method",
    severity: "warn",
    band: "postdoc",
    title: "No method named",
    why: "A paper-shaped ask without a method becomes a literature vibe piece.",
    insert:
      "Method: [estimator or interpretive protocol]. If mixed methods, name how the strands integrate.",
    when: (c) =>
      c.postdoc &&
      c.words >= 12 &&
      !IDENTIFICATION.test(c.text) &&
      !/\b(method|qualitative|quantitative|ethnograph|survey|experiment|model|regress)\b/i.test(
        c.text,
      ),
  },
  {
    id: "missing-falsifier",
    severity: "hint",
    band: "postdoc",
    title: "No falsifier",
    why: "If nothing could kill the claim, it is not empirical.",
    insert:
      "Falsifier: if [observable], abandon the claim. Write that sentence before the results section.",
    when: (c) => c.postdoc && c.words >= 16 && !FALSIFIER.test(c.text),
  },
  {
    id: "missing-limitations",
    severity: "hint",
    band: "postdoc",
    title: "Limitations are unnamed",
    why: "Reviewers look for selection, measurement, and external validity before the punchline.",
    insert:
      "Limitations: selection, measurement, confounding, external validity — name which ones bind.",
    when: (c) => c.postdoc && c.words >= 16 && !LIMITATIONS.test(c.text),
  },
  {
    id: "missing-replication",
    severity: "hint",
    band: "postdoc",
    title: "No replication packet",
    why: "A post-doc draft that cannot be re-run is a talk, not a paper.",
    insert:
      "Replication: code location, data access, preprocessing, seed or qualitative audit trail. Missing = UNKNOWN.",
    when: (c) =>
      c.postdoc &&
      c.words >= 16 &&
      !/\b(replicat|code repo|osf |data access|pre-process|audit trail)\b/i.test(c.text),
  },
  {
    id: "literature-review-vague",
    severity: "warn",
    band: "postdoc",
    title: "Literature review with no search protocol",
    why: "“Review the literature” without databases, years, or inclusion is a hallucination magnet.",
    insert:
      "Search protocol: databases, years, inclusion/exclusion, and how many records you actually have. Do not invent citations.",
    when: (c) =>
      c.postdoc &&
      /\b(literature review|review the literature|survey the field)\b/i.test(c.text) &&
      !/\b(jstor|westlaw|pubmed|scopus|web of science|courtlistener|query|inclusion)\b/i.test(
        c.text,
      ),
  },
  {
    id: "percent-unsourced",
    severity: "block",
    band: "evidence",
    title: "A percentage has no source",
    why: "Bare percents read as findings. AIP-Σ0 will flag them on optimize.",
    insert:
      "Every percent must quote the brief or be marked UNKNOWN with the table that would settle it.",
    when: (c) =>
      c.words >= 4 &&
      /(\d+(?:\.\d+)?\s*%|\bpercent\b|\bpercentage\b)/i.test(c.text) &&
      !/\b(source|according to|from |table |unknown)\b/i.test(c.text),
  },
  {
    id: "human-subjects",
    severity: "warn",
    band: "postdoc",
    title: "Human subjects without an ethics line",
    why: "Interviews, students, patients, or workers need an IRB / consent status — even if UNKNOWN.",
    insert:
      "Ethics: IRB status, consent, and what cannot be quoted. UNKNOWN if not determined.",
    when: (c) =>
      c.postdoc &&
      /\b(interview|students?|patients?|workers?|subjects?|participants?)\b/i.test(c.text) &&
      !/\b(irb|ethics|consent|exempt)\b/i.test(c.text),
  },
  {
    id: "ai-undefined",
    severity: "hint",
    band: "postdoc",
    title: "“AI” is not an operational construct",
    why: "Name the system, task, and metric or the paper is about a slogan.",
    insert:
      "Construct: name the model or tool, the task, and the metric. Do not write “AI” as a cause.",
    when: (c) =>
      c.postdoc &&
      /\b(ai|artificial intelligence|llm|chatgpt)\b/i.test(c.text) &&
      !/\b(gpt-|claude|llama|benchmark|accuracy|f1|latency|task:)\b/i.test(c.text),
  },
  {
    id: "prove-that",
    severity: "block",
    band: "postdoc",
    title: "“Prove that” is not a research verb",
    why: "Proof belongs to math. Empirical work tests, estimates, or interprets.",
    insert:
      "Replace “prove” with estimate / test / interpret. State the null you might fail to reject.",
    when: (c) => c.postdoc && /\bprove (that|why|how)\b/i.test(c.text),
  },
  {
    id: "generalize-all",
    severity: "warn",
    band: "postdoc",
    title: "Population is implied as everyone",
    why: "“People”, “firms”, or “users” without bounds over-claim external validity.",
    insert:
      "Population: [who, where, when]. Do not generalize past those bounds.",
    when: (c) =>
      c.postdoc &&
      c.words >= 12 &&
      /\b(people|everyone|users|firms|employees|consumers)\b/i.test(c.text) &&
      !/\b(among|in the|between \d{4}|us |uk |county|firm size|undergraduates)\b/i.test(
        c.text,
      ),
  },
];

const SHOWN_CAP = 8;

export function suggestLive(input: string, mode: unknown): SuggestionReport {
  const parsed = parseMode(mode);
  const text = input.trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const ctx: SuggestCtx = {
    text,
    words,
    mode: parsed,
    postdoc: parsed === "postdoc",
  };

  const idle = words === 0;
  const suggestions = idle ? [] : RULES.filter((rule) => rule.when(ctx)).map(toSuggestion);
  const shown = suggestions.slice(0, SHOWN_CAP);

  return {
    object: "lyra.suggest",
    bot: POSTDOC_BOT,
    protocol: POSTDOC_PROTOCOL,
    hardcoded: true,
    simulated: false,
    live: true,
    mode: parsed,
    wordCount: words,
    fired: suggestions.length,
    shown: shown.length,
    suggestions: shown,
    clear: !idle && suggestions.length === 0,
    idle,
  };
}

function toSuggestion(rule: Rule): LiveSuggestion {
  return {
    id: rule.id,
    severity: rule.severity,
    band: rule.band,
    title: rule.title,
    why: rule.why,
    insert: rule.insert,
  };
}

export function suggestionBotStatus() {
  return {
    object: "lyra.suggest.status" as const,
    bot: POSTDOC_BOT,
    hardcoded: true as const,
    simulated: false as const,
    live: true as const,
    ruleCount: RULES.length,
    ghostHandModes: ["detail", "postdoc"],
    note: "Rules are static pattern matchers. The bot never calls a hosted model.",
  };
}
