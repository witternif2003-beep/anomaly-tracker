import { ghostHandEngaged } from "./types";
import type { AipScan } from "../aip-sigma0/scanner";
import type {
  DeconstructResult,
  DiagnoseResult,
  DimensionalAxis,
  DimensionalTension,
  GhostHandLayer,
  Lyra2Lattice,
  Mode,
} from "./types";

const GHOST_AXIS = [
  { letter: "G", name: "Goal", hint: "Primary intent — what must actually happen" },
  { letter: "H", name: "Handoffs", hint: "Who receives the work and at what depth" },
  { letter: "O", name: "Output", hint: "Artifact shape, length, and format" },
  { letter: "S", name: "Stakes", hint: "How you will know the answer is done" },
  { letter: "T", name: "Taboos", hint: "Hard constraints, non-goals, and facts not to invent" },
] as const;

const HAND_AXIS = [
  { letter: "H", name: "Hypotheses", rule: "Label every unstated fact as an assumption." },
  { letter: "A", name: "Anchors", rule: "Do not invent citations, quotations, case names, APIs, metrics, or source URLs." },
  { letter: "N", name: "Negatives", rule: "Refuse filler, unsourced claims, and scope creep." },
  { letter: "D", name: "Done-when", rule: "Stop only when a skeptical editor could run the deliverable." },
] as const;

export const LYRA2_ENGINE = "lyra-2" as const;

function axis(
  id: string,
  family: DimensionalAxis["family"],
  name: string,
  score: 0 | 1 | 2,
  status: DimensionalAxis["status"],
  note: string,
): DimensionalAxis {
  return { id, family, name, score, status, note };
}

function fromGhost(layer: GhostHandLayer): Pick<DimensionalAxis, "score" | "status"> {
  if (layer.status === "provided") return { score: 2, status: "locked" };
  if (layer.status === "defaulted") return { score: 1, status: "defaulted" };
  if (layer.status === "asked") return { score: 0, status: "open" };
  if (layer.status === "armed") return { score: 1, status: "defaulted" };
  return { score: 0, status: "idle" };
}

export function idleLyra2Lattice(): Lyra2Lattice {
  const axes: DimensionalAxis[] = [
    axis("4d-deconstruct", "4d", "Deconstruct", 0, "idle", "Intent, entities, and gaps."),
    axis("4d-diagnose", "4d", "Diagnose", 0, "idle", "Clarity, completeness, complexity."),
    axis("4d-develop", "4d", "Develop", 0, "idle", "Role, techniques, structure."),
    axis("4d-deliver", "4d", "Deliver", 0, "idle", "Paste-ready prompt."),
    ...GHOST_AXIS.map((layer) =>
      axis(`ghost-${layer.letter}`, "ghost", layer.name, 1, "defaulted", layer.hint),
    ),
    ...HAND_AXIS.map((layer) =>
      axis(`hand-${layer.letter}`, "hand", layer.name, 1, "defaulted", layer.rule),
    ),
  ];
  return summarize(true, axes, []);
}

export function buildLyra2Lattice(opts: {
  mode: Mode;
  stage: "questions" | "complete" | "status";
  deconstruct: DeconstructResult;
  diagnose?: DiagnoseResult;
  ghost: GhostHandLayer[];
  inferred: string[];
  briefScan?: AipScan;
}): Lyra2Lattice {
  if (!ghostHandEngaged(opts.mode)) {
    const idle = idleLyra2Lattice();
    return { ...idle, engaged: false, axes: idle.axes.map((a) => ({ ...a, status: "idle", score: 0 })) };
  }

  const d = opts.deconstruct;
  const diag = opts.diagnose;
  const complete = opts.stage === "complete";
  const ghostByName = new Map(opts.ghost.map((g) => [g.name, g]));

  const deconstructScore: 0 | 1 | 2 = complete ? 2 : 1;
  const diagnoseScore: 0 | 1 | 2 =
    diag?.completeness === "high" ? 2 : diag?.completeness === "low" ? 0 : 1;
  const developScore: 0 | 1 | 2 = 2;
  const deliverScore: 0 | 1 | 2 = complete ? 2 : 0;

  const axes: DimensionalAxis[] = [
    axis(
      "4d-deconstruct",
      "4d",
      "Deconstruct",
      deconstructScore,
      deconstructScore === 2 ? "locked" : "defaulted",
      d.intent,
    ),
    axis(
      "4d-diagnose",
      "4d",
      "Diagnose",
      diagnoseScore,
      diagnoseScore === 2 ? "locked" : diagnoseScore === 0 ? "open" : "defaulted",
      diag
        ? `specificity ${diag.specificity} · completeness ${diag.completeness} · ${diag.complexity}`
        : "Diagnosis pending.",
    ),
    axis(
      "4d-develop",
      "4d",
      "Develop",
      developScore,
      "locked",
      "GHOST-HAND + AIP-Σ0 techniques applied.",
    ),
    axis(
      "4d-deliver",
      "4d",
      "Deliver",
      deliverScore,
      complete ? "locked" : "open",
      complete ? "Paste-ready prompt assembled." : "Waiting on GHOST intake or skip-defaults.",
    ),
  ];

  for (const layer of GHOST_AXIS) {
    const live = ghostByName.get(layer.name);
    const mapped = live ? fromGhost(live) : { score: 0 as const, status: "open" as const };
    axes.push(
      axis(
        `ghost-${layer.letter}`,
        "ghost",
        layer.name,
        mapped.score,
        mapped.status,
        live?.value || layer.hint,
      ),
    );
  }

  const unsourced = (opts.briefScan?.highCount ?? 0) > 0;
  const hypothesesOpen = d.missing.length >= 3;
  const anchorsStatus = unsourced ? ("open" as const) : ("locked" as const);
  const doneWhen = ghostByName.get("Stakes");
  const doneMapped = doneWhen ? fromGhost(doneWhen) : { score: 1 as const, status: "defaulted" as const };

  axes.push(
    axis(
      "hand-H",
      "hand",
      "Hypotheses",
      hypothesesOpen ? 0 : 2,
      hypothesesOpen ? "open" : "locked",
      hypothesesOpen
        ? `${d.missing.length} unstated facts — label each as an assumption.`
        : HAND_AXIS[0].rule,
    ),
    axis(
      "hand-A",
      "hand",
      "Anchors",
      unsourced ? 0 : 2,
      anchorsStatus,
      unsourced
        ? `Brief has ${opts.briefScan?.highCount} unsourced high-severity spans. Do not treat them as verified.`
        : HAND_AXIS[1].rule,
    ),
    axis(
      "hand-N",
      "hand",
      "Negatives",
      2,
      "locked",
      HAND_AXIS[2].rule,
    ),
    axis(
      "hand-D",
      "hand",
      "Done-when",
      doneMapped.score,
      doneMapped.status,
      doneWhen?.value || HAND_AXIS[3].rule,
    ),
  );

  const tensions: DimensionalTension[] = [];
  if (unsourced) {
    tensions.push({
      id: "anchors-evidence",
      left: "Anchors",
      right: "AIP-Σ0",
      severity: "warn",
      note: "The brief contains unsourced citations or statistics. Repeat them only as claims to verify, never as holdings.",
    });
  }
  if (d.missing.includes("audience") && d.missing.includes("output format")) {
    tensions.push({
      id: "handoffs-output",
      left: "Handoffs",
      right: "Output",
      severity: "warn",
      note: "Audience and artifact shape are both open. Depth and format will drift unless labeled as defaults.",
    });
  }
  if (d.missing.includes("success criteria") && (diag?.complexity === "complex" || d.missing.length >= 3)) {
    tensions.push({
      id: "stakes-diagnose",
      left: "Stakes",
      right: "Diagnose",
      severity: "warn",
      note: "No definition of done on a messy brief. The model will keep writing past the useful answer.",
    });
  }
  if (!d.constraints.length && d.missing.includes("constraints / non-goals")) {
    tensions.push({
      id: "taboos-goal",
      left: "Taboos",
      right: "Goal",
      severity: "info",
      note: "No non-goals were named. State what not to invent, sell, or expand.",
    });
  }
  if (hypothesesOpen) {
    tensions.push({
      id: "hypotheses-goal",
      left: "Hypotheses",
      right: "Goal",
      severity: "info",
      note: "Several facts required by the goal are still missing. Keep them labeled UNKNOWN.",
    });
  }

  return summarize(true, axes, tensions.slice(0, 4));
}

function summarize(
  engaged: boolean,
  axes: DimensionalAxis[],
  tensions: DimensionalTension[],
): Lyra2Lattice {
  return {
    engine: LYRA2_ENGINE,
    protocol: "GHOST-HAND",
    hyperDimensional: true,
    engaged,
    axisCount: axes.length,
    lockedCount: axes.filter((a) => a.status === "locked").length,
    openCount: axes.filter((a) => a.status === "open").length,
    tensionCount: tensions.length,
    axes,
    tensions,
  };
}

export function formatLatticeForPrompt(lattice: Lyra2Lattice): string {
  const lines = [
    "Lyra-2 hyper-dimensional mode is engaged. GHOST-HAND is the protocol. Address every axis. If an axis is open or defaulted, label the assumption. If a tension is listed, resolve it explicitly in the answer — do not ignore the conflict.",
    "",
    "Axes:",
    ...lattice.axes.map(
      (a) =>
        `- [${a.family}] ${a.name} (${a.status}, ${a.score}/2): ${a.note.slice(0, 220)}`,
    ),
  ];
  if (lattice.tensions.length) {
    lines.push("", "Tensions to resolve:");
    for (const t of lattice.tensions) {
      lines.push(`- ${t.left} ↔ ${t.right} [${t.severity}]: ${t.note}`);
    }
  }
  return lines.join("\n");
}
