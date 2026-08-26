import type { DeconstructResult, DiagnoseResult, GhostHandLayer, GhostHandReport, Mode } from "./types";
import type { AipScan } from "../aip-sigma0/scanner";
import { buildLyra2Lattice, idleLyra2Lattice, LYRA2_ENGINE } from "./lyra2";

export const GHOST_HAND_PROTOCOL = "GHOST-HAND" as const;

export const GHOST_LAYERS = [
  { letter: "G", name: "Goal", hint: "Primary intent — what must actually happen" },
  { letter: "H", name: "Handoffs", hint: "Who receives the work and at what depth" },
  { letter: "O", name: "Output", hint: "Artifact shape, length, and format" },
  { letter: "S", name: "Stakes", hint: "How you will know the answer is done" },
  { letter: "T", name: "Taboos", hint: "Hard constraints, non-goals, and facts not to invent" },
] as const;

export const HAND_LAYERS = [
  {
    letter: "H",
    name: "Hypotheses",
    rule: "Label every unstated fact as an assumption. Never present a guess as a finding.",
  },
  {
    letter: "A",
    name: "Anchors",
    rule: "Do not invent citations, quotations, case names, APIs, metrics, or source URLs. If the brief does not contain it, write UNKNOWN and name what would verify it.",
  },
  {
    letter: "N",
    name: "Negatives",
    rule: "Refuse filler, unsourced claims, scope creep, and generic best-practice slogans that could apply to any brief.",
  },
  {
    letter: "D",
    name: "Done-when",
    rule: "Stop only when a skeptical editor could run the deliverable without asking what you meant.",
  },
] as const;

export function ghostHandStatus(): GhostHandReport {
  const lattice = idleLyra2Lattice();
  return {
    active: true,
    protocol: GHOST_HAND_PROTOCOL,
    mode: "detailed",
    defaultOn: true,
    engine: LYRA2_ENGINE,
    hyperDimensional: true,
    ghost: GHOST_LAYERS.map((layer) => ({
      letter: layer.letter,
      name: layer.name,
      hint: layer.hint,
      status: "armed",
      value: layer.hint,
    })),
    hand: HAND_LAYERS.map((layer) => ({
      letter: layer.letter,
      name: layer.name,
      rule: layer.rule,
    })),
    lattice: { ...lattice, engaged: true },
  };
}

export function buildGhostHandReport(opts: {
  mode: Mode;
  deconstruct: DeconstructResult;
  answers: Record<string, string>;
  inferred: string[];
  diagnose?: DiagnoseResult;
  briefScan?: AipScan;
  stage?: "questions" | "complete";
}): GhostHandReport {
  const inactive: GhostHandReport = {
    ...ghostHandStatus(),
    active: false,
    mode: "basic",
    defaultOn: true,
    hyperDimensional: false,
    ghost: GHOST_LAYERS.map((layer) => ({
      letter: layer.letter,
      name: layer.name,
      hint: layer.hint,
      status: "idle",
      value: "Basic mode — GHOST intake skipped",
    })),
    lattice: buildLyra2Lattice({
      mode: "basic",
      stage: "complete",
      deconstruct: opts.deconstruct,
      diagnose: opts.diagnose,
      ghost: [],
      inferred: opts.inferred,
    }),
  };
  if (opts.mode !== "detail") return inactive;

  const d = opts.deconstruct;
  const a = opts.answers;
  const ghost: GhostHandLayer[] = [
    {
      letter: "G",
      name: "Goal",
      hint: GHOST_LAYERS[0].hint,
      status: "provided",
      value: d.intent,
    },
    {
      letter: "H",
      name: "Handoffs",
      hint: GHOST_LAYERS[1].hint,
      status: layerStatus(Boolean(d.audience || a.audience?.trim()), opts.inferred, "Audience"),
      value: a.audience?.trim() || d.audience || "smart default (audience)",
    },
    {
      letter: "O",
      name: "Output",
      hint: GHOST_LAYERS[2].hint,
      status: layerStatus(
        Boolean(d.outputRequirements.length || a.format?.trim()),
        opts.inferred,
        "Output format",
      ),
      value: a.format?.trim() || d.outputRequirements.join(", ") || "smart default (format)",
    },
    {
      letter: "S",
      name: "Stakes",
      hint: GHOST_LAYERS[3].hint,
      status: layerStatus(Boolean(a.success?.trim() || !d.missing.includes("success criteria")), opts.inferred, "success"),
      value: a.success?.trim() || "skeptical-editor test (default)",
    },
    {
      letter: "T",
      name: "Taboos",
      hint: GHOST_LAYERS[4].hint,
      status: layerStatus(
        Boolean(d.constraints.length || a.context?.trim()),
        opts.inferred,
        "constraint",
      ),
      value: a.context?.trim() || d.constraints.join("; ") || "no-invent + labeled assumptions",
    },
  ];

  const hand = HAND_LAYERS.map((layer) => ({
    letter: layer.letter,
    name: layer.name,
    rule: layer.rule,
  }));
  const stage = opts.stage ?? "complete";
  return {
    active: true,
    protocol: GHOST_HAND_PROTOCOL,
    mode: "detailed",
    defaultOn: true,
    engine: LYRA2_ENGINE,
    hyperDimensional: true,
    ghost,
    hand,
    lattice: buildLyra2Lattice({
      mode: opts.mode,
      stage,
      deconstruct: d,
      diagnose: opts.diagnose,
      ghost,
      inferred: opts.inferred,
      briefScan: opts.briefScan,
    }),
  };
}

function layerStatus(
  provided: boolean,
  inferred: string[],
  needle: string,
): GhostHandLayer["status"] {
  if (provided) return "provided";
  if (inferred.some((item) => item.toLowerCase().includes(needle.toLowerCase()))) return "defaulted";
  return "asked";
}
