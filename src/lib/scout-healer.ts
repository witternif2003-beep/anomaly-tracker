/**
 * 24/7 fixture scout + self-heal helpers.
 * Never removes features — only restores / rehydrates missing state.
 */

import { withBasePath } from "@/lib/static-data";

export type ScoutSeverity = "P1" | "P2" | "P3";

export type ScoutFinding = {
  id: string;
  severity: ScoutSeverity;
  title: string;
  detail: string;
  healable: boolean;
  healed?: boolean;
  healAction?: string;
};

export type ScoutSnapshot = {
  sceneNodeCount: number;
  sceneEventCount: number;
  p1Count: number;
  blackOwnedCount: number;
  mayPacketCount: number;
  crimeCategoryCount: number;
  crimeCaseCount: number;
  postdocTotal: number;
  telemetryActive: boolean;
  scanBotActive: boolean;
  selectedAnomalyId?: string | null;
  selectedEntityId?: string | null;
};

export type ScoutHealResult = {
  findings: ScoutFinding[];
  healedCount: number;
  bookPatch?: Record<string, unknown>;
  selectedAnomalyId?: string | null;
  selectedEntityId?: string | null;
  reloadedBook?: unknown;
};

const EXPECTED = {
  minNodes: 15,
  minEvents: 51,
  crimeCategories: 52,
  crimeCases: 60,
  postdoc: 500,
  mayPackets: 15,
};

export function inspectTrackerBook(book: any, opts?: {
  selectedAnomalyId?: string | null;
  selectedEntityId?: string | null;
}): ScoutFinding[] {
  const findings: ScoutFinding[] = [];
  if (!book) {
    findings.push({
      id: "book-missing",
      severity: "P1",
      title: "Tracker book missing",
      detail: "Client lost anomaly payload — refill from static bake.",
      healable: true,
      healAction: "reload-static",
    });
    return findings;
  }

  const nodes = book.scene?.nodes ?? [];
  const events = book.scene?.events ?? [];
  const anomalies = book.anomalies ?? [];
  const packets = book.mayForensicPackets ?? {};
  const crime = book.businessCrimeCatalog ?? {};
  const bot = book.blackOwnedScanBot ?? {};
  const postdoc = book.postdocCatalog ?? {};
  const telemetry = book.telemetry ?? {};

  if (!book.scene?.populated || nodes.length < EXPECTED.minNodes) {
    findings.push({
      id: "scene-nodes",
      severity: "P1",
      title: "Scene nodes underfilled",
      detail: `nodes=${nodes.length} expected>=${EXPECTED.minNodes}`,
      healable: true,
      healAction: "reload-static",
    });
  }
  if (events.length < EXPECTED.minEvents) {
    findings.push({
      id: "scene-events",
      severity: "P1",
      title: "Scene events underfilled",
      detail: `events=${events.length} expected>=${EXPECTED.minEvents}`,
      healable: true,
      healAction: "reload-static",
    });
  }
  if ((crime.categoryCount ?? 0) !== EXPECTED.crimeCategories) {
    findings.push({
      id: "crime-categories",
      severity: "P1",
      title: "Business-crime categories incomplete",
      detail: `categories=${crime.categoryCount ?? 0} expected=${EXPECTED.crimeCategories}`,
      healable: true,
      healAction: "reload-static",
    });
  }
  if ((crime.caseCount ?? 0) !== EXPECTED.crimeCases) {
    findings.push({
      id: "crime-cases",
      severity: "P1",
      title: "Business-crime cases incomplete",
      detail: `cases=${crime.caseCount ?? 0} expected=${EXPECTED.crimeCases}`,
      healable: true,
      healAction: "reload-static",
    });
  }
  if (Object.keys(packets).length < EXPECTED.mayPackets) {
    findings.push({
      id: "may-packets",
      severity: "P1",
      title: "May forensic packets incomplete",
      detail: `packets=${Object.keys(packets).length} expected=${EXPECTED.mayPackets}`,
      healable: true,
      healAction: "reload-static",
    });
  }
  if ((postdoc.total ?? 0) !== EXPECTED.postdoc) {
    findings.push({
      id: "postdoc-500",
      severity: "P2",
      title: "Post-doc catalog not at 500",
      detail: `total=${postdoc.total ?? 0}`,
      healable: true,
      healAction: "reload-static",
    });
  }
  if (!telemetry.active) {
    findings.push({
      id: "telemetry",
      severity: "P2",
      title: "Telemetry inactive",
      detail: "Fixture-clock telemetry flag false",
      healable: true,
      healAction: "reload-static",
    });
  }
  if (!bot.active) {
    findings.push({
      id: "bo-scan-bot",
      severity: "P2",
      title: "Black-owned scan bot inactive",
      detail: "Scan bot active flag false",
      healable: true,
      healAction: "reload-static",
    });
  }

  const scout = book.scoutBot ?? {};
  if (!scout.active || !scout.selfHealing) {
    findings.push({
      id: "scout-bot-marker",
      severity: "P3",
      title: "Error scout bot marker missing",
      detail: "Attach scoutBot self-heal marker (additive)",
      healable: true,
      healAction: "attach-scout-marker",
    });
  }

  const selected = opts?.selectedAnomalyId;
  if (selected && anomalies.length && !anomalies.some((a: any) => a.id === selected)) {
    findings.push({
      id: "orphan-selected-anomaly",
      severity: "P2",
      title: "Selected anomaly orphaned",
      detail: `selected=${selected} not in anomalies`,
      healable: true,
      healAction: "reset-selected-anomaly",
    });
  }

  const selectedEntity = opts?.selectedEntityId;
  if (selectedEntity && nodes.length && !nodes.some((n: any) => n.id === selectedEntity)) {
    findings.push({
      id: "orphan-selected-entity",
      severity: "P2",
      title: "Selected entity orphaned",
      detail: `selected=${selectedEntity} not in scene.nodes`,
      healable: true,
      healAction: "reset-selected-entity",
    });
  }

  const checks = book.pipelineHealth?.checks ?? [];
  for (const check of checks) {
    if (check && check.ok === false) {
      findings.push({
        id: `pipeline-${check.id}`,
        severity: "P1",
        title: `Pipeline check failed: ${check.id}`,
        detail: check.detail ?? "failed",
        healable: true,
        healAction: "reload-static",
      });
    }
  }

  return findings;
}

export async function fetchStaticAnomalyBook(): Promise<unknown | null> {
  try {
    const res = await fetch(withBasePath("/static/anomaly.json"), { cache: "no-store" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("json") && type !== "") {
      // Pages may omit content-type; still try parse
    }
    return await res.json();
  } catch {
    return null;
  }
}

export async function runScoutHeal(
  book: any,
  opts?: {
    selectedAnomalyId?: string | null;
    selectedEntityId?: string | null;
  },
): Promise<ScoutHealResult> {
  const findings = inspectTrackerBook(book, opts);
  let nextBook = book;
  let selectedAnomalyId = opts?.selectedAnomalyId ?? null;
  let selectedEntityId = opts?.selectedEntityId ?? null;
  let healedCount = 0;
  let reloadedBook: unknown | undefined;

  const needsReload = findings.some((f) => f.healAction === "reload-static" && f.healable);
  if (needsReload) {
    const fresh = await fetchStaticAnomalyBook();
    if (fresh && typeof fresh === "object") {
      nextBook = fresh;
      reloadedBook = fresh;
      healedCount += findings.filter((f) => f.healAction === "reload-static").length;
      for (const f of findings) {
        if (f.healAction === "reload-static") {
          f.healed = true;
        }
      }
    }
  }

  // Re-inspect after reload for selection heals.
  const after = inspectTrackerBook(nextBook, { selectedAnomalyId, selectedEntityId });
  for (const f of after) {
    if (!findings.some((x) => x.id === f.id)) findings.push(f);
  }

  if (findings.some((f) => f.id === "orphan-selected-anomaly" && f.healable)) {
    const p1 = nextBook?.p1Queue?.[0]?.id ?? nextBook?.anomalies?.[0]?.id ?? null;
    selectedAnomalyId = p1;
    healedCount += 1;
    const row = findings.find((f) => f.id === "orphan-selected-anomaly");
    if (row) row.healed = true;
  }

  if (findings.some((f) => f.id === "orphan-selected-entity" && f.healable)) {
    const owned = nextBook?.scene?.nodes?.find((n: any) => n.blackOwned)?.id;
    selectedEntityId = owned ?? nextBook?.scene?.nodes?.[0]?.id ?? null;
    healedCount += 1;
    const row = findings.find((f) => f.id === "orphan-selected-entity");
    if (row) row.healed = true;
  }

  // Ensure scoutBot presence marker without removing anything.
  if (nextBook && (!nextBook.scoutBot || !nextBook.scoutBot.active)) {
    nextBook = {
      ...nextBook,
      scoutBot: {
        object: "lyra.scout-bot",
        title: "Error scout bot",
        mode: "fixture-clock-24x7",
        active: true,
        selfHealing: true,
        additiveOnly: true,
        note: "Client-side scout attached by healer — never removes features.",
        healActions: [
          "reload-static",
          "reset-selected-anomaly",
          "reset-selected-entity",
          "attach-scout-marker",
        ],
        liveSurveillance: false,
      },
    };
    healedCount += 1;
    const row = findings.find((f) => f.id === "scout-bot-marker");
    if (row) {
      row.healed = true;
      row.healAction = "attach-scout-marker";
    }
  }

  return {
    findings,
    healedCount,
    selectedAnomalyId,
    selectedEntityId,
    reloadedBook,
    bookPatch: nextBook !== book ? nextBook : undefined,
  };
}

export function snapshotFromBook(book: any): ScoutSnapshot {
  return {
    sceneNodeCount: book?.scene?.nodes?.length ?? 0,
    sceneEventCount: book?.scene?.events?.length ?? 0,
    p1Count: book?.summary?.p1Events ?? book?.p1Queue?.length ?? 0,
    blackOwnedCount: book?.summary?.blackOwnedEntities ?? 0,
    mayPacketCount: Object.keys(book?.mayForensicPackets ?? {}).length,
    crimeCategoryCount: book?.businessCrimeCatalog?.categoryCount ?? 0,
    crimeCaseCount: book?.businessCrimeCatalog?.caseCount ?? 0,
    postdocTotal: book?.postdocCatalog?.total ?? 0,
    telemetryActive: Boolean(book?.telemetry?.active),
    scanBotActive: Boolean(book?.blackOwnedScanBot?.active),
  };
}

export const SCOUT_TICK_MS = 1800;
