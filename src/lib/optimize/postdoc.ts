import type { ClarifyingQuestion, DeconstructResult, Mode, RequestType } from "./types";

export const POSTDOC_PROTOCOL = "POSTDOC" as const;
export const POSTDOC_BOT = "postdoc-live" as const;

export const POSTDOC_LAYERS = [
  {
    letter: "Q",
    name: "Question",
    hint: "One falsifiable research question",
    rule: "State a single research question a methods editor could reject. Ban slogans.",
  },
  {
    letter: "I",
    name: "Identification",
    hint: "Design that could support the claim",
    rule: "Name the identification or interpretive strategy. If none exists, write UNKNOWN — do not imply causality.",
  },
  {
    letter: "C",
    name: "Corpus",
    hint: "Data, years, N, inclusion",
    rule: "Inventory the corpus: source, years, N or saturation rule, inclusion/exclusion. Do not invent a dataset.",
  },
  {
    letter: "K",
    name: "Contribution",
    hint: "What is new versus named prior art",
    rule: "Ban 'novel' and 'first' unless a prior-art search is specified. Name the closest papers or traditions you are moving.",
  },
  {
    letter: "F",
    name: "Falsifiers",
    hint: "What result would kill the claim",
    rule: "List the observation that would force you to abandon the claim. If you cannot, the claim is not empirical.",
  },
  {
    letter: "L",
    name: "Limitations",
    hint: "Measurement, selection, external validity",
    rule: "Inventory threats: measurement, selection, confounding, external validity. Do not bury them in a footnote.",
  },
  {
    letter: "R",
    name: "Replicability",
    hint: "Enough to re-run",
    rule: "Specify code, data access, preprocessing, and a seed or qualitative audit trail. Missing pieces are UNKNOWN.",
  },
] as const;

export function postdocStatus() {
  return {
    object: "lyra.postdoc" as const,
    protocol: POSTDOC_PROTOCOL,
    bot: POSTDOC_BOT,
    hardcoded: true as const,
    simulated: false as const,
    liveSuggestions: true as const,
    layers: POSTDOC_LAYERS.map((layer) => ({
      letter: layer.letter,
      name: layer.name,
      hint: layer.hint,
      rule: layer.rule,
    })),
    note: "Post-doctoral mode is a local prompt contract plus a hard-coded suggestion bot. It does not call a model and is not a university credential.",
  };
}

export function postdocRole(base: string, d: DeconstructResult): string {
  const domain = d.entities[0] ? ` in ${d.entities[0]}` : "";
  return `a postdoctoral researcher and adversarial peer reviewer${domain} who writes for a methods editor, not a blog. Separate claims, identification, and speculation. The working specialist underneath that stance: ${base}`;
}

export function postdocTechniques(): string[] {
  return [
    "Post-doctoral protocol (Q-I-C-K-F-L-R)",
    "Hard-coded live suggestion bot",
    "Identification before rhetoric",
    "Competing hypotheses",
    "Citation hygiene / no-invent prior art",
    "Limitations inventory",
    "Replication packet",
  ];
}

export function postdocProcess(): string[] {
  return [
    "State the single research question in one sentence. If you cannot, stop and name what is missing.",
    "Name the identification or interpretive strategy that could support the claim. If none, mark UNKNOWN and do not write causal verbs.",
    "Inventory the corpus: source, years, N or saturation rule, inclusion/exclusion. Do not invent observations.",
    "List two competing hypotheses and the evidence that would favor each.",
    "Write the contribution against named prior art. Ban 'novel' and 'first' unless the search protocol is specified.",
    "Close with limitations, external validity, and a replication packet (code, data access, preprocessing).",
  ];
}

export function postdocQuestions(type: RequestType): ClarifyingQuestion[] {
  return [
    {
      id: "question",
      ghostLetter: "G",
      question: "Question — what is the one falsifiable ask?",
      rationale: "POSTDOC Q: a methods editor will bounce a brief that cannot name the question.",
      placeholder:
        type === "educational"
          ? "e.g. Does retrieval practice raise delayed recall relative to restudy among undergraduates?"
          : "e.g. Does the 2018 shock raise employment in treated counties relative to neighbors?",
    },
    {
      id: "method",
      ghostLetter: "T",
      question: "Identification — what design could support the claim?",
      rationale: "POSTDOC I: causality without a design is rhetoric.",
      placeholder: "e.g. difference-in-differences, RCT, instrumental variable, grounded-theory saturation, process tracing",
    },
    {
      id: "corpus",
      ghostLetter: "O",
      question: "Corpus — what data, years, and N are in hand?",
      rationale: "POSTDOC C: do not let the model mint a convenient dataset.",
      placeholder: "e.g. ACS 2015–2019, N=…; or 42 interviews, stop rule = two empty cycles",
    },
    {
      id: "contribution",
      ghostLetter: "S",
      question: "Contribution — what is new versus named prior art?",
      rationale: "POSTDOC K: 'novel' without a search is a red flag.",
      placeholder: "e.g. extends Author (YEAR) by adding a second shock and a pre-trend test",
    },
  ];
}

export function postdocPromptSections(
  answers: Record<string, string>,
  d: DeconstructResult,
): Record<string, string> {
  const question = answers.question?.trim();
  const method = answers.method?.trim();
  const corpus = answers.corpus?.trim();
  const contribution = answers.contribution?.trim();
  return {
    "POSTDOC / Question": question
      ? `Research question (user): ${question}`
      : `${POSTDOC_LAYERS[0].rule} Infer a candidate question from the brief and label it ASSUMED.`,
    "POSTDOC / Identification": method
      ? `Design (user): ${method}\n${POSTDOC_LAYERS[1].rule}`
      : POSTDOC_LAYERS[1].rule,
    "POSTDOC / Corpus": corpus
      ? `Corpus (user): ${corpus}\n${POSTDOC_LAYERS[2].rule}`
      : d.entities.length
        ? `${POSTDOC_LAYERS[2].rule} Named entities in the brief: ${d.entities.join(", ")}. Do not add datasets.`
        : POSTDOC_LAYERS[2].rule,
    "POSTDOC / Contribution": contribution
      ? `Contribution (user): ${contribution}\n${POSTDOC_LAYERS[3].rule}`
      : POSTDOC_LAYERS[3].rule,
    "POSTDOC / Falsifiers": POSTDOC_LAYERS[4].rule,
    "POSTDOC / Limitations": POSTDOC_LAYERS[5].rule,
    "POSTDOC / Replicability": POSTDOC_LAYERS[6].rule,
    "POSTDOC / Voice":
      "Write as a peer-review letter plus a methods memo. Prefer 'the brief does not identify…' over confident narrative. No TED-talk cadence. No unsourced percentages.",
  };
}

export function postdocImplementation(): string[] {
  return [
    "Post-doctoral mode is on. The prompt includes Q-I-C-K-F-L-R. Do not strip those sections.",
    "The live suggestion bot is hard-coded — it did not call a model. Treat remaining red suggestions as open methods gaps.",
    "If the model still writes 'this proves', reply: 'Replace causal verbs with the identification you actually have, or UNKNOWN.'",
  ];
}

export function isPostdocMode(mode: Mode): boolean {
  return mode === "postdoc";
}
