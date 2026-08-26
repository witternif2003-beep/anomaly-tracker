/**
 * Deterministic post-doctoral forensic query catalog.
 * Shared by server bake + /tracker client virtual expand.
 * Never removes features — additive only. No live intercepts/CJIS.
 */

export const POSTDOC_TOTAL = 725_500;
export const POSTDOC_TOP500 = 500;
/** Baked window of non-SOTA samples for offline filter demos (beyond TOP 500). */
export const POSTDOC_BAKE_SAMPLE = 200;

export type PostdocAxis = {
  id: string;
  label: string;
  prompt: string;
  sota?: boolean;
  sourceId?: string;
};

export type PostdocSeed = {
  axes: PostdocAxis[];
  methods: string[];
  falsifiers: string[];
  deliverables: string[];
  categories: Array<{ id: string; label: string }>;
  entityTypes: Array<{ id: string; label: string }>;
  elements: Array<{
    id: string;
    artifact: string;
    collectionStatus?: string;
    wontDo?: string | null;
  }>;
  maps: Array<{ fbiCategory: string; categoryId?: string }>;
  researchQuestions: Array<{ id: string; status?: string; wontDo?: string | null }>;
  total?: number;
  top500?: number;
};

export type PostdocImprovement = {
  id: string;
  index: number;
  axisId: string;
  axisLabel: string;
  title: string;
  question: string;
  method: string;
  falsifier: string;
  deliverable: string;
  lyraBinding: string;
  categoryId: string;
  categoryLabel: string;
  entityTypeId: string;
  entityTypeLabel: string;
  fbiCategory: string | null;
  evidenceId: string | null;
  artifact: string | null;
  rqAnchor: string;
  status: "open" | "constrained";
  wontDo: string | null;
  priority: "P1" | "P2" | "P3";
  pipelineCheck: string;
  sotaRank?: number | null;
  sotaTier?: "top500-sota" | "catalog";
  sotaSourceId?: string | null;
  forensicQuery: string;
  trackerTab?: boolean;
};

export function buildPostdocImprovement(
  index: number,
  seed: PostdocSeed,
  opts?: { total?: number; top500?: number },
): PostdocImprovement {
  const total = opts?.total ?? seed.total ?? POSTDOC_TOTAL;
  const top500 = opts?.top500 ?? seed.top500 ?? POSTDOC_TOP500;
  const axes = seed.axes;
  const sotaAxes = axes.filter((a) => a.sota);
  const methods = seed.methods;
  const falsifiers = seed.falsifiers;
  const deliverables = seed.deliverables;
  const categories = seed.categories;
  const entityTypes = seed.entityTypes;
  const elements = seed.elements;
  const maps = seed.maps;
  const rqs = seed.researchQuestions;

  const slot = index + 1;
  const inTop500 = index < top500;
  const axis = inTop500
    ? sotaAxes[index % Math.max(1, sotaAxes.length)]
    : axes[index % Math.max(1, axes.length)];
  const method = methods[index % Math.max(1, methods.length)];
  const falsifier = falsifiers[Math.floor(index / 3) % Math.max(1, falsifiers.length)];
  const deliverable = deliverables[Math.floor(index / 5) % Math.max(1, deliverables.length)];
  const category = categories[index % Math.max(1, categories.length)];
  const entityType = entityTypes[index % Math.max(1, entityTypes.length)];
  const element = elements[index % Math.max(1, elements.length)];
  const map = maps[index % Math.max(1, maps.length)];
  const rq = rqs[index % Math.max(1, rqs.length)];

  const constrained =
    element.collectionStatus === "constrained" ||
    axis.id === "ethics-guardrails" ||
    axis.id === "cross-border-hold" ||
    rq.status === "constrained";
  const wontDo = constrained
    ? (typeof element.wontDo === "string" ? element.wontDo : null) ??
      rq.wontDo ??
      "sigint-intercepts"
    : null;

  const priority: "P1" | "P2" | "P3" = inTop500
    ? index % 5 === 0
      ? "P1"
      : index % 2 === 0
        ? "P2"
        : "P3"
    : index % 7 === 0
      ? "P1"
      : index % 3 === 0
        ? "P2"
        : "P3";

  const pad = String(slot).padStart(5, "0");
  const forensicQuery = `FQ-${pad} · TRACKER · Live-P1 · BO-scan · Chamber-CRISP · ${axis.label} · ${entityType.label} · ${category.label} · artifact=${element.artifact}`;

  return {
    id: `pd-${pad}`,
    index: slot,
    axisId: axis.id,
    axisLabel: axis.label,
    title: inTop500
      ? `TOP ${slot} · ${axis.label} · ${entityType.label}`
      : `${axis.label} · ${entityType.label} · ${category.label}`,
    question: `${axis.prompt} Apply on /tracker (Live P1 telemetry + Black-owned auto-queue + 3D anomaly chamber CRISP) to ${entityType.label} under ${category.label} with artifact lens "${element.artifact}".`,
    method,
    falsifier,
    deliverable,
    lyraBinding: `Anchor ${rq.id}. Bind ${map.fbiCategory} → ${category.id}. Fixture evidence ${element.id}. Method=${method}. Deliverable=${deliverable}. Verify via bash scripts/pipelines/tracker-3d-smoke.sh.`,
    categoryId: category.id,
    categoryLabel: category.label,
    entityTypeId: entityType.id,
    entityTypeLabel: entityType.label,
    fbiCategory: map.fbiCategory,
    evidenceId: element.id,
    artifact: element.artifact,
    rqAnchor: rq.id,
    status: constrained ? "constrained" : "open",
    wontDo,
    priority,
    pipelineCheck: `tracker-tab · live-p1-telemetry · black-owned-auto-queue · chamber-crisp · postdoc-${total} · top500-sota · telemetry-24x7 · falsifier=${falsifier}`,
    sotaRank: inTop500 ? slot : null,
    sotaTier: inTop500 ? "top500-sota" : "catalog",
    sotaSourceId: axis.sourceId ?? null,
    forensicQuery,
    trackerTab: true,
  };
}

export function listPostdocRange(
  seed: PostdocSeed,
  opts?: {
    offset?: number;
    limit?: number;
    q?: string;
    axisId?: string;
    status?: string;
    sotaOnly?: boolean;
    total?: number;
    top500?: number;
  },
): { total: number; generated: number; data: PostdocImprovement[] } {
  const total = opts?.total ?? seed.total ?? POSTDOC_TOTAL;
  const top500 = opts?.top500 ?? seed.top500 ?? POSTDOC_TOP500;
  const offset = Math.max(0, opts?.offset ?? 0);
  const limit = Math.min(Math.max(1, opts?.limit ?? 50), 500);
  const q = opts?.q?.trim().toLowerCase();
  const axisId = opts?.axisId?.trim();
  const status = opts?.status?.trim().toLowerCase();
  const sotaOnly = opts?.sotaOnly === true;
  const end = sotaOnly ? top500 : total;

  const matched: PostdocImprovement[] = [];
  // Streaming filter: scan until we fill the page or exhaust catalog.
  // Cap scan budget for UI responsiveness on 95.5k virtual catalog.
  const scanBudget = sotaOnly ? top500 : Math.min(total, Math.max(8_000, offset + limit * 40));
  for (let i = 0; i < scanBudget && matched.length < offset + limit; i++) {
    const item = buildPostdocImprovement(i, seed, { total, top500 });
    if (sotaOnly && item.sotaTier !== "top500-sota") continue;
    if (axisId && item.axisId !== axisId) continue;
    if (status && item.status !== status) continue;
    if (q) {
      const hay =
        `${item.title} ${item.question} ${item.method} ${item.forensicQuery} ${item.artifact ?? ""} ${item.fbiCategory ?? ""} ${item.axisLabel}`
          .toLowerCase();
      if (!hay.includes(q)) continue;
    }
    matched.push(item);
  }

  return {
    total: sotaOnly ? top500 : total,
    generated: total,
    data: matched.slice(offset, offset + limit),
  };
}

export function seedFromCatalogPayload(catalog: {
  axes?: PostdocAxis[];
  methods?: string[];
  falsifiers?: string[];
  deliverables?: string[];
  expandSeed?: PostdocSeed;
  total?: number;
  top500Count?: number;
}): PostdocSeed | null {
  if (catalog.expandSeed) {
    return {
      ...catalog.expandSeed,
      total: catalog.total ?? catalog.expandSeed.total ?? POSTDOC_TOTAL,
      top500: catalog.top500Count ?? catalog.expandSeed.top500 ?? POSTDOC_TOP500,
    };
  }
  if (!catalog.axes?.length || !catalog.methods?.length) return null;
  return null;
}
