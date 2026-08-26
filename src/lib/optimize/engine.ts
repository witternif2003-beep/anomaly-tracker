import type {
  ClarifyingQuestion,
  DeconstructResult,
  DiagnoseResult,
  Mode,
  OptimizeRequest,
  OptimizeResult,
  Platform,
  RequestType,
} from "./types";

const VAGUE = [
  "thing",
  "things",
  "stuff",
  "something",
  "someone",
  "nice",
  "good",
  "better",
  "best",
  "cool",
  "awesome",
  "interesting",
  "etc",
  "maybe",
  "kind of",
  "sort of",
  "whatever",
  "help me",
  "make it",
];

const FORMAT_CUES: Array<[RegExp, string]> = [
  [/\b(json|yaml|xml)\b/i, "structured data"],
  [/\b(table|spreadsheet|csv)\b/i, "tabular layout"],
  [/\b(bullet|bullets|list|checklist)\b/i, "bulleted list"],
  [/\b(markdown|md)\b/i, "Markdown"],
  [/\b(email|e-mail)\b/i, "email"],
  [/\b(blog|article|essay|post)\b/i, "long-form article"],
  [/\b(code|script|function|class)\b/i, "code"],
  [/\b(slide|deck|presentation)\b/i, "slide outline"],
  [/\b(tweet|thread|linkedin)\b/i, "social post"],
  [/\b(plan|roadmap|steps?)\b/i, "phased plan"],
  [/\b(summary|tldr|tl;dr)\b/i, "summary"],
];

const AUDIENCE_CUES: Array<[RegExp, string]> = [
  [/\b(beginner|newbie|novice|first time)\b/i, "beginners"],
  [/\b(expert|senior|advanced|principal)\b/i, "experts"],
  [/\b(exec|executive|c-suite|leadership|board)\b/i, "executives"],
  [/\b(kids?|children|middle school|high school)\b/i, "young learners"],
  [/\b(customer|user|client)\b/i, "customers"],
  [/\b(engineer|developer|dev team)\b/i, "engineers"],
  [/\b(non-technical|layperson|general audience)\b/i, "non-technical readers"],
];

const TONE_CUES: Array<[RegExp, string]> = [
  [/\b(formal|professional|board-ready)\b/i, "formal and precise"],
  [/\b(casual|friendly|conversational)\b/i, "conversational"],
  [/\b(witty|funny|humor)\b/i, "witty"],
  [/\b(skeptical|critical|blunt|direct)\b/i, "direct and skeptical"],
  [/\b(warm|empathetic|supportive)\b/i, "warm"],
  [/\b(exciting|hype|energetic)\b/i, "energetic"],
];

const CONSTRAINT_CUES = [
  /\b(don't|do not|never|avoid|without|must not|no )\b/i,
  /\b(must|need to|required|only|using|in python|in typescript|under \d+)\b/i,
  /\b(\d+\s*(words?|pages?|minutes?|hours?))\b/i,
];

const ACTION_VERBS = [
  "write",
  "create",
  "draft",
  "compose",
  "generate",
  "design",
  "build",
  "explain",
  "teach",
  "summarize",
  "analyze",
  "review",
  "critique",
  "debug",
  "fix",
  "refactor",
  "plan",
  "migrate",
  "compare",
  "translate",
  "rewrite",
  "improve",
  "optimize",
  "research",
  "outline",
  "brainstorm",
  "help",
];

const CREATIVE_HINTS =
  /\b(story|poem|brand|copy|ad|campaign|email|headline|voice|tone|creative|novel|screenplay|slogan|name|blog|landing page)\b/i;
const TECHNICAL_HINTS =
  /\b(code|api|bug|debug|function|typescript|python|sql|schema|infra|kubernetes|latency|algorithm|compile|error|stack|endpoint|auth|database)\b/i;
const EDUCATIONAL_HINTS =
  /\b(explain|teach|learn|lesson|tutorial|beginner|how does|what is|concept|course|curriculum|quiz)\b/i;
const COMPLEX_HINTS =
  /\b(migrate|architecture|strategy|roadmap|trade-?off|system|multi-step|org|stakeholders|risk|phased|governance)\b/i;

function firstMatch(
  text: string,
  cues: Array<[RegExp, string]>,
): string | undefined {
  for (const [re, label] of cues) {
    if (re.test(text)) return label;
  }
  return undefined;
}

function allMatches(text: string, cues: Array<[RegExp, string]>): string[] {
  const found: string[] = [];
  for (const [re, label] of cues) {
    if (re.test(text) && !found.includes(label)) found.push(label);
  }
  return found;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  const quoted = text.match(/["“]([^"”]{2,60})["”]/g) ?? [];
  for (const q of quoted) entities.add(q.replace(/["“”]/g, "").trim());

  const proper = text.match(
    /\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3}\b/g,
  );
  for (const p of proper ?? []) {
    if (!["I", "A", "The", "This", "We", "My"].includes(p)) entities.add(p);
  }

  const tech =
    text.match(
      /\b(Python|TypeScript|JavaScript|React|Next\.js|Rails|SQL|GraphQL|REST|Kubernetes|AWS|GPT-4|Claude|Gemini|OAuth|JWT|PostgreSQL|Redis|Docker)\b/gi,
    ) ?? [];
  for (const t of tech) entities.add(t);

  return [...entities].slice(0, 8);
}

function extractConstraints(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.filter((s) => CONSTRAINT_CUES.some((re) => re.test(s)));
}

function detectVerb(text: string): string {
  const lower = text.toLowerCase();
  for (const verb of ACTION_VERBS) {
    const re = new RegExp(`\\b${verb}\\b`);
    if (re.test(lower)) return verb;
  }
  return "complete";
}

function classify(text: string, choice: OptimizeRequest["requestType"]): RequestType {
  if (choice !== "auto") return choice;
  const scores: Record<RequestType, number> = {
    creative: CREATIVE_HINTS.test(text) ? 2 : 0,
    technical: TECHNICAL_HINTS.test(text) ? 2 : 0,
    educational: EDUCATIONAL_HINTS.test(text) ? 2 : 0,
    complex: COMPLEX_HINTS.test(text) ? 2 : 0,
  };
  if (wordCount(text) > 60) scores.complex += 1;
  if (/\band then\b|\balso\b|\bplus\b/i.test(text)) scores.complex += 1;
  const ranked = (Object.keys(scores) as RequestType[]).sort(
    (a, b) => scores[b] - scores[a],
  );
  if (scores[ranked[0]] === 0) {
    if (wordCount(text) < 18) return "creative";
    return "complex";
  }
  return ranked[0];
}

function deconstruct(text: string, type: RequestType): DeconstructResult {
  const verb = detectVerb(text);
  const subject = text
    .replace(new RegExp(`^.*?\\b${verb}\\b`, "i"), "")
    .replace(/^[\s,.:;-]+/, "")
    .trim()
    .slice(0, 180);
  const formats = allMatches(text, FORMAT_CUES);
  const audience = firstMatch(text, AUDIENCE_CUES);
  const tone = firstMatch(text, TONE_CUES);
  const constraints = extractConstraints(text);
  const entities = extractEntities(text);

  const provided: string[] = ["raw task"];
  const missing: string[] = [];

  if (formats.length) provided.push("output format");
  else missing.push("output format");

  if (audience) provided.push("audience");
  else missing.push("audience");

  if (tone) provided.push("tone");
  else if (type === "creative") missing.push("tone / voice");

  if (constraints.length) provided.push("explicit constraints");
  else missing.push("constraints / non-goals");

  if (entities.length) provided.push("named entities");
  if (wordCount(text) < 20) missing.push("domain context");
  if (!/\b(success|done when|acceptance|criteria)\b/i.test(text)) {
    missing.push("success criteria");
  }

  const intent =
    verb === "complete"
      ? `Produce a high-quality response for: ${text.trim().slice(0, 140)}`
      : `${capitalize(verb)} ${subject || "the requested deliverable"} with enough specificity that another model could execute it without guessing.`;

  return {
    intent,
    taskVerb: verb,
    subject: subject || text.trim().slice(0, 120),
    entities,
    outputRequirements: formats,
    constraints,
    audience,
    tone,
    provided,
    missing,
  };
}

function diagnose(text: string, d: DeconstructResult): DiagnoseResult {
  const wc = wordCount(text);
  const vagueHits = VAGUE.filter((v) =>
    new RegExp(`\\b${escapeRe(v)}\\b`, "i").test(text),
  );
  const clarityGaps: string[] = [];
  const ambiguity: string[] = [];

  if (wc < 16) {
    clarityGaps.push("The request is too short to pin down scope, audience, or bar.");
  }
  if (vagueHits.length) {
    ambiguity.push(
      `Soft language (${vagueHits.slice(0, 4).join(", ")}) leaves quality undefined.`,
    );
  }
  if (!d.audience) {
    clarityGaps.push("No audience is named, so depth and jargon level are undefined.");
  }
  if (!d.outputRequirements.length) {
    clarityGaps.push("No output shape is specified (length, format, or artifacts).");
  }
  if (d.missing.includes("success criteria")) {
    clarityGaps.push("There is no test for a finished answer.");
  }
  if ((text.match(/\band\b/gi) ?? []).length > 3 && wc < 80) {
    ambiguity.push("Several tasks are jammed into one request without priority.");
  }

  let specificity: DiagnoseResult["specificity"] = "medium";
  if (wc < 18 || vagueHits.length >= 2) specificity = "low";
  if (wc > 40 && d.constraints.length && d.outputRequirements.length) {
    specificity = "high";
  }

  let completeness: DiagnoseResult["completeness"] = "medium";
  if (d.missing.length >= 3) completeness = "low";
  if (d.missing.length <= 1 && d.provided.length >= 3) completeness = "high";

  const complexity: DiagnoseResult["complexity"] =
    wc > 70 || d.missing.length >= 4
      ? "complex"
      : wc < 20
        ? "simple"
        : "moderate";

  const structureNeeds: string[] = [
    "Assign an expert role instead of a generic assistant",
    "Separate objective, context, constraints, and output contract",
  ];
  if (complexity !== "simple") {
    structureNeeds.push("Add an explicit working process the model must follow");
  }

  return {
    clarityGaps,
    ambiguity,
    specificity,
    completeness,
    complexity,
    structureNeeds,
  };
}

function techniquesFor(type: RequestType, complexity: DiagnoseResult["complexity"]): string[] {
  const shared = ["Role assignment", "Context layering", "Explicit output contract"];
  if (type === "creative") {
    return [...shared, "Multi-perspective generation", "Tone and voice lock", "Anti-cliché constraints"];
  }
  if (type === "technical") {
    return [...shared, "Constraint-based reasoning", "Precision over completeness", "Failure-mode checks"];
  }
  if (type === "educational") {
    return [...shared, "Few-shot shape", "Progressive disclosure", "Misconception handling"];
  }
  return [
    ...shared,
    "Chain-of-thought / staged analysis",
    "Decision framework",
    complexity === "complex" ? "Risk and trade-off matrix" : "Priority ordering",
  ];
}

function roleFor(type: RequestType, d: DeconstructResult): string {
  const domain = d.entities[0] ? ` specializing in ${d.entities[0]}` : "";
  switch (type) {
    case "creative":
      return `a senior brand writer and creative director${domain} who produces specific, memorable work rather than generic marketing language`;
    case "technical":
      return `a principal engineer${domain} who reviews systems for correctness, failure modes, and operational cost — not just happy-path design`;
    case "educational":
      return `an expert instructor${domain} who teaches ambitious learners without condescension or unexplained jargon`;
    case "complex":
      return `a staff-level operator and systems strategist${domain} who decomposes messy, multi-stakeholder problems into sequenced decisions`;
  }
}

function defaultAudience(type: RequestType, d: DeconstructResult): string {
  if (d.audience) return d.audience;
  switch (type) {
    case "creative":
      return "the people who will actually receive the piece (customers, not the internal team)";
    case "technical":
      return "experienced practitioners who want a decision, not a tutorial";
    case "educational":
      return "curious intermediates: they know the surrounding field, not this specific idea";
    case "complex":
      return "a decision-maker who must act with incomplete information";
  }
}

function defaultFormat(type: RequestType, d: DeconstructResult): string {
  if (d.outputRequirements.length) return d.outputRequirements.join(", ");
  switch (type) {
    case "creative":
      return "a complete draft ready to send or publish, plus a 3-line rationale";
    case "technical":
      return "findings first, then evidence, then a recommended change list";
    case "educational":
      return "a structured lesson: hook, model, worked example, common mistakes, check-for-understanding";
    case "complex":
      return "an executive brief, then a phased plan with risks, owners, and decision points";
  }
}

function defaultTone(type: RequestType, d: DeconstructResult): string {
  if (d.tone) return d.tone;
  switch (type) {
    case "creative":
      return "specific, sensory, and commercially sharp — never fluffy";
    case "technical":
      return "precise and skeptical; name uncertainty instead of smoothing it over";
    case "educational":
      return "clear, concrete, and paced; analogize, then return to the real mechanism";
    case "complex":
      return "calm and decision-oriented; no theatre, no false certainty";
  }
}

function processBlock(type: RequestType): string[] {
  switch (type) {
    case "creative":
      return [
        "List three distinct angles (emotional, practical, contrarian) before drafting.",
        "Choose the strongest angle and write the full piece in that voice.",
        "Do a second pass that cuts clichés, vague intensifiers, and claims you cannot support.",
        "Deliver the draft, then a short note on the angle you rejected and why.",
      ];
    case "technical":
      return [
        "Restate the problem and the non-goals before proposing anything.",
        "Identify the constraints that actually bind (correctness, latency, operability, cost).",
        "Propose a solution with explicit trade-offs and failure modes.",
        "List what you would verify next (tests, metrics, or a spike) before calling it done.",
      ];
    case "educational":
      return [
        "State the one idea the reader should leave with.",
        "Give a concrete example before the abstraction.",
        "Show a common misconception and why it is tempting.",
        "Close with a small exercise or question that proves they understood.",
      ];
    case "complex":
      return [
        "Separate facts, assumptions, and open questions.",
        "Name the decision that actually needs to be made, and by whom.",
        "Generate two viable paths, not one 'best practice' slogan.",
        "Recommend a path with conditions that would change your mind.",
        "Sequence work into phases with kill criteria.",
      ];
  }
}

function fewShot(type: RequestType): string | null {
  if (type !== "educational") return null;
  return [
    "Shape the explanation like this miniature example (do not copy the topic):",
    'Q: "Why does a hash table have O(1) lookups?"',
    'A: Start with a coat-check ticket (the key maps to a hook). Then show the array index. Then name the collision case and why it still averages constant time. End with: "If two names hash to the same hook, we walk a short chain — that is the asterisk on O(1)."',
  ].join("\n");
}

function wrapForPlatform(platform: Platform, sections: Record<string, string>): string {
  if (platform === "claude") {
    return Object.entries(sections)
      .map(([key, value]) => {
        const tag = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        return `<${tag}>\n${value.trim()}\n</${tag}>`;
      })
      .join("\n\n");
  }

  if (platform === "gemini") {
    const order = Object.entries(sections);
    return [
      "You will complete the task below. Prefer comparative structure (options, then a recommendation) whenever a choice exists. Be concrete.",
      "",
      ...order.map(([key, value], i) => `${i + 1}. ${key}\n${value.trim()}`),
    ].join("\n\n");
  }

  // ChatGPT + universal: markdown sections
  return Object.entries(sections)
    .map(([key, value]) => `## ${key}\n${value.trim()}`)
    .join("\n\n");
}

function buildPrompt(
  input: string,
  type: RequestType,
  platform: Platform,
  d: DeconstructResult,
  answers: Record<string, string>,
): { prompt: string; inferred: string[] } {
  const inferred: string[] = [];
  const audience = answers.audience?.trim() || defaultAudience(type, d);
  if (!answers.audience && !d.audience) inferred.push(`Audience defaulted to: ${audience}`);

  const format = answers.format?.trim() || defaultFormat(type, d);
  if (!answers.format && !d.outputRequirements.length) {
    inferred.push(`Output format defaulted to: ${format}`);
  }

  const tone = answers.tone?.trim() || defaultTone(type, d);
  if (!answers.tone && !d.tone && type === "creative") {
    inferred.push(`Tone defaulted to: ${tone}`);
  }

  const extra = answers.context?.trim();
  const success = answers.success?.trim();

  const constraintLines = [
    ...d.constraints,
    "Do not invent facts, citations, APIs, or metrics. If unknown, say so and state the assumption.",
    "Prefer specific nouns and numbers over adjectives.",
    "If the brief is still missing a critical fact, ask at most two questions, then proceed with labeled assumptions.",
  ];
  if (extra) constraintLines.unshift(`Additional context from the user: ${extra}`);

  const sections: Record<string, string> = {
    Role: `You are ${roleFor(type, d)}.`,
    Objective: d.intent,
    "Original brief": input.trim(),
    Audience: audience,
    Context: [
      extra ? extra : null,
      d.entities.length ? `Key entities to keep in frame: ${d.entities.join(", ")}.` : null,
      "Treat unstated details as assumptions. Label every assumption you make.",
    ]
      .filter(Boolean)
      .join("\n"),
    Constraints: constraintLines.map((c) => `- ${c}`).join("\n"),
    Process: processBlock(type)
      .map((step, i) => `${i + 1}. ${step}`)
      .join("\n"),
    "Output contract": [
      `Deliverable: ${format}.`,
      success ? `Done when: ${success}` : "Done when a skeptical editor could run the result without asking what you meant.",
      `Voice: ${tone}.`,
    ].join("\n"),
  };

  const shot = fewShot(type);
  if (shot) sections["Worked shape"] = shot;

  if (type === "creative") {
    sections["Anti-patterns"] =
      "Ban: 'revolutionize', 'game-changer', 'in today's fast-paced world', 'unlock', 'elevate', 'leverage', 'delve'. If a sentence could appear in any brand's ad, rewrite it.";
  }

  return { prompt: wrapForPlatform(platform, sections), inferred };
}

function platformNotes(platform: Platform, type: RequestType): string {
  switch (platform) {
    case "chatgpt":
      return "Paste as a single user message. On GPT-4-class models, the markdown headings keep the contract in-distribution. For repeated use, put Role + Constraints in a Custom GPT / system instruction and keep Objective + Original brief in the user turn.";
    case "claude":
      return "Claude follows XML-ish tags reliably over long context. If you enable extended thinking, keep Process inside <process> and ask it to reason there before writing the deliverable. You can append more source material inside a <context> tag without rewriting the rest.";
    case "gemini":
      return "Gemini responds well to numbered sections and explicit comparison. If the task is creative, ask it to produce two variants, then a merge. For technical work, request a short table of options before the recommendation.";
    default:
      return type === "complex"
        ? "On smaller models, keep Role + Output contract and drop Process if the context window is tight. On stronger models, leave Process in — it is the quality lever."
        : "This layout is model-agnostic. If the model ignores a section, move Output contract to the top.";
  }
}

function implementation(platform: Platform, mode: Mode, type: RequestType): string[] {
  const steps = [
    "Copy the optimized prompt in full. Do not send the original one-liner alongside it.",
    "Attach any source files, code, or data after the prompt, clearly labeled.",
  ];
  if (mode === "detail") {
    steps.push(
      "Answers you gave in Detail mode are already baked in. If you learn more later, add a short 'Update' section rather than rewriting.",
    );
  }
  if (type === "technical") {
    steps.push("Paste the actual code or schema. The prompt is a contract; the artifact is the evidence.");
  }
  if (platform === "chatgpt") {
    steps.push("If the first reply is generic, reply with: 'Score this against the Output contract and revise.'");
  } else if (platform === "claude") {
    steps.push("If the draft is thin, add more material in <context> and say 'Revise in place; do not restart.'");
  } else {
    steps.push("If the model hedges, ask for a recommendation table with a single starred choice.");
  }
  return steps;
}

function whatChanged(
  input: string,
  type: RequestType,
  techniques: string[],
  d: DeconstructResult,
  diag: DiagnoseResult,
): string[] {
  const items = [
    `Assigned a specialist role instead of a generic helper.`,
    `Locked the task as ${type} work and applied: ${techniques.slice(3).join(", ") || "structured constraints"}.`,
    "Split the ask into role, objective, audience, constraints, process, and an output contract.",
  ];
  if (diag.specificity === "low") {
    items.push("Replaced vague quality words with testable constraints and a definition of done.");
  }
  if (!d.audience) {
    items.push("Filled the missing audience so depth and jargon have a target.");
  }
  if (!d.outputRequirements.length) {
    items.push("Specified a deliverable shape so the model cannot wander into the wrong artifact.");
  }
  if (wordCount(input) < 20) {
    items.push("Expanded a short brief into an executable spec without changing the user's actual goal.");
  }
  return items;
}

function buildQuestions(d: DeconstructResult, type: RequestType): ClarifyingQuestion[] {
  const pool: ClarifyingQuestion[] = [];

  if (d.missing.includes("audience")) {
    pool.push({
      id: "audience",
      question: "Who is this for?",
      rationale: "Audience sets vocabulary, depth, and what 'good' looks like.",
      placeholder:
        type === "educational"
          ? "e.g. backend engineers who have never trained a model"
          : "e.g. existing customers, not prospects",
    });
  }
  if (d.missing.includes("output format")) {
    pool.push({
      id: "format",
      question: "What should the finished artifact look like?",
      rationale: "A model will invent a format if you do not name one.",
      placeholder: "e.g. 600-word email, PR comment, 1-page brief, JSON schema",
    });
  }
  if (d.missing.includes("constraints / non-goals") || type === "technical") {
    pool.push({
      id: "context",
      question: "Any hard constraints or facts I must not guess?",
      rationale: "Missing constraints are the main source of confident wrong answers.",
      placeholder: "e.g. must work offline, no new vendors, Python 3.11 only, cannot name competitors",
    });
  }
  if (type === "creative" && !d.tone) {
    pool.push({
      id: "tone",
      question: "What voice should this have?",
      rationale: "Creative work collapses without a voice lock.",
      placeholder: "e.g. dry and British, like a careful friend, premium but not luxury-cosplay",
    });
  }
  if (d.missing.includes("success criteria") && pool.length < 3) {
    pool.push({
      id: "success",
      question: "How will you know the answer is good enough?",
      rationale: "A definition of done stops fluent filler.",
      placeholder: "e.g. I can paste it into the weekly update without editing the structure",
    });
  }

  return pool.slice(0, 3);
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function optimize(request: OptimizeRequest): OptimizeResult {
  const input = request.input.trim();
  if (!input) {
    throw new Error("Paste a draft prompt or a rough ask first.");
  }
  if (input.length < 8) {
    throw new Error("Give Lyra a little more to work with — at least a short sentence.");
  }

  const type = classify(input, request.requestType);
  const d = deconstruct(input, type);
  const diag = diagnose(input, d);
  const techniques = techniquesFor(type, diag.complexity);
  const answers = request.answers ?? {};
  const hasAnswers = Object.values(answers).some((v) => v.trim().length > 0);
  const questions = buildQuestions(d, type);

  if (
    request.mode === "detail" &&
    !request.skipQuestions &&
    !hasAnswers &&
    questions.length > 0
  ) {
    return {
      status: "questions",
      mode: request.mode,
      requestType: type,
      platform: request.platform,
      questions,
      deconstruct: d,
      diagnose: diag,
      techniques,
      role: roleFor(type, d),
      optimizedPrompt: "",
      whatChanged: [],
      implementation: [],
      platformNotes: platformNotes(request.platform, type),
      inferredDefaults: [],
    };
  }

  const built = buildPrompt(input, type, request.platform, d, answers);

  return {
    status: "complete",
    mode: request.mode,
    requestType: type,
    platform: request.platform,
    questions: request.mode === "detail" ? questions : undefined,
    deconstruct: d,
    diagnose: diag,
    techniques,
    role: roleFor(type, d),
    optimizedPrompt: built.prompt,
    whatChanged: whatChanged(input, type, techniques, d, diag),
    implementation: implementation(request.platform, request.mode, type),
    platformNotes: platformNotes(request.platform, type),
    inferredDefaults: built.inferred,
  };
}
