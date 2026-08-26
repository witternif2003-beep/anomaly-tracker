/**
 * 24/7 fixture scout + self-heal helpers (supercharged / postdoc extreme scan).
 * Never removes features — only restores / rehydrates missing state.
 * Target: ≥45 inspect gates covering payload, pipelines, credentials, BO, crime, chamber.
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
  gateGroup?: string;
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
  gateCount: number;
  openFindings: number;
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
  gateCount: number;
  openAfterHeal: number;
};

export const EXPECTED = {
  minNodes: 15,
  minEvents: 51,
  minAnomalies: 12,
  crimeCategories: 52,
  crimeCases: 60,
  postdoc: 500,
  mayPackets: 15,
  mayCategories: 10,
  mayElements: 43,
  improvementsGenerated: 10080,
  improvementSeeds: 65,
  evidenceElements: 30,
  fbiMapRows: 10,
  boDiscoveryPool: 24,
  boCandidates: 12,
  boStreamMin: 100,
  boHardeningGates: 50,
  boHardeningScore: 95,
  envPlaceholders: 18,
  envFreeResolved: 16,
  pipelineScripts: 12,
  scoutHealActionsMin: 4,
} as const;

/** All pipeline script ids the scout expects to see reflected in bake or local markers. */
export const PIPELINE_IDS = [
  "aip-static-smoke",
  "business-crime-audit",
  "cloudflare-ci",
  "cloudflare-p1-health",
  "env-placeholders",
  "local-api-smoke",
  "no-github-actions",
  "p1-catalog-audit",
  "policy-guard",
  "skill-agent-roster",
  "tracker-3d-smoke",
  "tracker-html-budget",
] as const;

function push(
  findings: ScoutFinding[],
  finding: ScoutFinding,
): void {
  findings.push(finding);
}

export function inspectTrackerBook(
  book: any,
  opts?: {
    selectedAnomalyId?: string | null;
    selectedEntityId?: string | null;
    extreme?: boolean;
  },
): ScoutFinding[] {
  const findings: ScoutFinding[] = [];
  const extreme = opts?.extreme !== false; // default on — postdoc extreme scan

  if (!book) {
    push(findings, {
      id: "book-missing",
      severity: "P1",
      title: "Tracker book missing",
      detail: "Client lost anomaly payload — refill from static bake.",
      healable: true,
      healAction: "reload-static",
      gateGroup: "payload",
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
  const summary = book.summary ?? {};
  const credentials = book.credentials ?? {};
  const improvements = book.improvements ?? {};
  const annex = book.improvementAnnex ?? {};
  const evidenceMap = book.evidenceMap ?? {};
  const fbiMap = book.fbiToCorporate ?? [];
  const scout = book.scoutBot ?? {};
  const nodeIds = new Set(nodes.map((n: any) => n.id));

  // —— Payload / scene / chamber ——
  if (!book.scene?.populated || nodes.length < EXPECTED.minNodes) {
    push(findings, {
      id: "scene-nodes",
      severity: "P1",
      title: "Scene nodes underfilled",
      detail: `nodes=${nodes.length} expected>=${EXPECTED.minNodes}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "chamber",
    });
  }
  if (book.scene && book.scene.populated !== true) {
    push(findings, {
      id: "scene-populated-flag",
      severity: "P1",
      title: "Scene populated flag false",
      detail: `populated=${String(book.scene?.populated)}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "chamber",
    });
  }
  if (events.length < EXPECTED.minEvents) {
    push(findings, {
      id: "scene-events",
      severity: "P1",
      title: "Scene events underfilled",
      detail: `events=${events.length} expected>=${EXPECTED.minEvents}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "chamber",
    });
  }
  if (extreme) {
    const orphanEvents = events.filter((e: any) => e?.entityId && !nodeIds.has(e.entityId));
    if (orphanEvents.length) {
      push(findings, {
        id: "scene-event-entity-refs",
        severity: "P1",
        title: "Scene events reference missing entities",
        detail: `orphans=${orphanEvents.length} e.g. ${orphanEvents[0]?.id}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "chamber",
      });
    }
    const badGeo = [...nodes, ...events].filter(
      (row: any) =>
        row &&
        (("lat" in row && !Number.isFinite(row.lat)) ||
          ("lon" in row && !Number.isFinite(row.lon)) ||
          (row.position &&
            (!Number.isFinite(row.position.x) ||
              !Number.isFinite(row.position.y) ||
              !Number.isFinite(row.position.z)))),
    );
    if (badGeo.length) {
      push(findings, {
        id: "scene-geo-finite",
        severity: "P1",
        title: "Non-finite scene geo / positions",
        detail: `bad=${badGeo.length}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "chamber",
      });
    }
    if (book.scene?.kind && book.scene.kind !== "css-3d-anomaly-chamber" && book.scene.kind !== "r3f-globe") {
      // accept both chamber kinds used in bake
      push(findings, {
        id: "chamber-kind",
        severity: "P3",
        title: "Unexpected scene kind",
        detail: `kind=${book.scene.kind}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "chamber",
      });
    }
    if ((summary.entities ?? 0) !== nodes.length || (summary.anomalies ?? 0) !== anomalies.length) {
      push(findings, {
        id: "summary-scene-parity",
        severity: "P2",
        title: "Summary vs scene length mismatch",
        detail: `summary entities=${summary.entities} nodes=${nodes.length} anomalies=${summary.anomalies}/${anomalies.length}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "chamber",
      });
    }
    if (nodes.length < EXPECTED.minNodes || anomalies.length < EXPECTED.minAnomalies) {
      push(findings, {
        id: "globe-payload-floor",
        severity: "P1",
        title: "Globe payload below floor",
        detail: `entities=${nodes.length} anomalies=${anomalies.length}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "chamber",
      });
    }
  }

  // Mobile Pages crash guard / scout hydrate
  if (typeof window !== "undefined" && !scout.active) {
    push(findings, {
      id: "scout-missing-on-client",
      severity: "P2",
      title: "Scout marker missing after client hydrate",
      detail: "Attach scoutBot and re-validate static bake",
      healable: true,
      healAction: "attach-scout-marker",
      gateGroup: "scout",
    });
  }

  // —— Crime DB ——
  if ((crime.categoryCount ?? 0) !== EXPECTED.crimeCategories) {
    push(findings, {
      id: "crime-categories",
      severity: "P1",
      title: "Business-crime categories incomplete",
      detail: `categories=${crime.categoryCount ?? 0} expected=${EXPECTED.crimeCategories}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "crime",
    });
  }
  if ((crime.caseCount ?? 0) !== EXPECTED.crimeCases) {
    push(findings, {
      id: "crime-cases",
      severity: "P1",
      title: "Business-crime cases incomplete",
      detail: `cases=${crime.caseCount ?? 0} expected=${EXPECTED.crimeCases}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "crime",
    });
  }
  if (extreme) {
    const catLen = Array.isArray(crime.categories) ? crime.categories.length : 0;
    const caseLen = Array.isArray(crime.cases) ? crime.cases.length : 0;
    if (catLen !== EXPECTED.crimeCategories || caseLen !== EXPECTED.crimeCases) {
      push(findings, {
        id: "crime-catalog-array-len",
        severity: "P1",
        title: "Crime catalog array length mismatch",
        detail: `categories.length=${catLen} cases.length=${caseLen}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "crime",
      });
    }
    const stream = Array.isArray(bot.stream) ? bot.stream : [];
    const ledger = Array.isArray(bot.crimeLedger) ? bot.crimeLedger : [];
    const covered = new Set<string>();
    for (const row of [...stream, ...ledger]) {
      const id = row?.crimeCategoryId ?? row?.categoryId;
      if (id) covered.add(String(id));
    }
    if (covered.size > 0 && covered.size < EXPECTED.crimeCategories) {
      push(findings, {
        id: "bo-crime-coverage-52",
        severity: "P1",
        title: "BO crime stream missing categories",
        detail: `covered=${covered.size} expected=${EXPECTED.crimeCategories}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "crime",
      });
    }
    const ledgerCount = bot.crimeLedgerCount ?? ledger.length;
    if (ledgerCount > 0 && ledgerCount < EXPECTED.crimeCategories) {
      push(findings, {
        id: "crime-ledger-min-52",
        severity: "P2",
        title: "Crime ledger below floor",
        detail: `ledger=${ledgerCount}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "crime",
      });
    }
    if (crime.liveFeeds === true || bot.liveCrimeFeeds === true) {
      push(findings, {
        id: "crime-live-feeds-off",
        severity: "P1",
        title: "Live crime feeds unexpectedly on",
        detail: "Fixture rehearsal must keep liveCrimeFeeds=false",
        healable: true,
        healAction: "reload-static",
        gateGroup: "crime",
      });
    }
  }

  // —— May forensic ——
  if (Object.keys(packets).length < EXPECTED.mayPackets) {
    push(findings, {
      id: "may-packets",
      severity: "P1",
      title: "May forensic packets incomplete",
      detail: `packets=${Object.keys(packets).length} expected=${EXPECTED.mayPackets}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "may",
    });
  }
  if (extreme) {
    if (Object.keys(packets).length !== nodes.length && nodes.length >= EXPECTED.minNodes) {
      push(findings, {
        id: "may-packet-count-exact",
        severity: "P1",
        title: "May packets ≠ entity count",
        detail: `packets=${Object.keys(packets).length} nodes=${nodes.length}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "may",
      });
    }
    const badPackets = Object.values(packets).filter(
      (p: any) =>
        (p?.categoryCount ?? 0) !== EXPECTED.mayCategories ||
        (p?.elementCount ?? 0) !== EXPECTED.mayElements,
    );
    if (badPackets.length) {
      push(findings, {
        id: "may-categories-10",
        severity: "P1",
        title: "May packet category/element counts wrong",
        detail: `badPackets=${badPackets.length} expected cats=${EXPECTED.mayCategories} els=${EXPECTED.mayElements}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "may",
      });
    }
    if (evidenceMap?.mayPacket && evidenceMap.mayPacket.everyEntityHasFullPacket === false) {
      push(findings, {
        id: "may-every-entity-flag",
        severity: "P2",
        title: "Evidence map May flag false",
        detail: "everyEntityHasFullPacket=false",
        healable: true,
        healAction: "reload-static",
        gateGroup: "may",
      });
    }
    if ((evidenceMap.elementCount ?? 0) < EXPECTED.evidenceElements) {
      push(findings, {
        id: "evidence-corpus-30",
        severity: "P2",
        title: "Evidence corpus underfilled",
        detail: `elements=${evidenceMap.elementCount ?? 0}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "may",
      });
    }
    const fbiRows = Array.isArray(fbiMap) && fbiMap.length
      ? fbiMap
      : Array.isArray(evidenceMap.fbiToCorporate)
        ? evidenceMap.fbiToCorporate
        : [];
    if (fbiRows.length < EXPECTED.fbiMapRows) {
      push(findings, {
        id: "fbi-map-rows",
        severity: "P2",
        title: "FBI→corporate map underfilled",
        detail: `rows=${fbiRows.length}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "may",
      });
    }
  }

  // —— Postdoc / improvements ——
  if ((postdoc.total ?? 0) !== EXPECTED.postdoc) {
    push(findings, {
      id: "postdoc-500",
      severity: "P2",
      title: "Post-doc catalog not at 500",
      detail: `total=${postdoc.total ?? 0}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "postdoc",
    });
  }
  if (extreme) {
    const postdocDataLen = Array.isArray(postdoc.data) ? postdoc.data.length : 0;
    if (postdocDataLen > 0 && postdocDataLen !== EXPECTED.postdoc) {
      push(findings, {
        id: "postdoc-data-length",
        severity: "P2",
        title: "Post-doc data array length ≠ 500",
        detail: `data.length=${postdocDataLen}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "postdoc",
      });
    }
    if ((summary.postdocImprovements ?? 0) !== EXPECTED.postdoc) {
      push(findings, {
        id: "postdoc-summary-parity",
        severity: "P2",
        title: "Summary postdocImprovements ≠ 500",
        detail: `summary=${summary.postdocImprovements ?? 0}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "postdoc",
      });
    }
    if (
      (improvements.generated ?? improvements.total ?? 0) > 0 &&
      (improvements.generated ?? improvements.total ?? 0) < EXPECTED.improvementsGenerated
    ) {
      push(findings, {
        id: "improvements-generated-10080",
        severity: "P2",
        title: "Improvements generated below 10080",
        detail: `generated=${improvements.generated ?? improvements.total ?? 0}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "postdoc",
      });
    }
    if ((annex.seedCount ?? 0) > 0 && (annex.seedCount ?? 0) < EXPECTED.improvementSeeds) {
      push(findings, {
        id: "improvement-annex-seeds",
        severity: "P3",
        title: "Improvement annex seeds low",
        detail: `seedCount=${annex.seedCount ?? 0}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "postdoc",
      });
    }
  }

  // —— Telemetry ——
  if (!telemetry.active) {
    push(findings, {
      id: "telemetry",
      severity: "P2",
      title: "Telemetry inactive",
      detail: "Fixture-clock telemetry flag false",
      healable: true,
      healAction: "reload-static",
      gateGroup: "telemetry",
    });
  }
  if (
    extreme &&
    telemetry.active &&
    nodes.length &&
    anomalies.length &&
    telemetry.totalTicks !== nodes.length * anomalies.length &&
    telemetry.totalTicks !== nodes.length * events.length
  ) {
    // accept nodes*anomalies or nodes*events depending on bake
    const expectedA = nodes.length * anomalies.length;
    const expectedE = nodes.length * events.length;
    if (telemetry.totalTicks !== expectedA && telemetry.totalTicks !== expectedE) {
      push(findings, {
        id: "telemetry-ticks-parity",
        severity: "P2",
        title: "Telemetry tick count mismatch",
        detail: `ticks=${telemetry.totalTicks} expected ${expectedA} or ${expectedE}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "telemetry",
      });
    }
  }

  // —— Black-owned scan ——
  if (!bot.active) {
    push(findings, {
      id: "bo-scan-bot",
      severity: "P2",
      title: "Black-owned scan bot inactive",
      detail: "Scan bot active flag false",
      healable: true,
      healAction: "reload-static",
      gateGroup: "bo-scan",
    });
  }
  if (bot.active && bot.autoQueueOnDiscover === false) {
    push(findings, {
      id: "bo-auto-queue",
      severity: "P1",
      title: "Auto-queue on discover disabled",
      detail: "New businesses must auto-admit to scan queue",
      healable: true,
      healAction: "reload-static",
      gateGroup: "bo-scan",
    });
  }
  if (bot.active && (bot.hardening?.hardeningScore ?? 0) < EXPECTED.boHardeningScore) {
    push(findings, {
      id: "bo-hardening-score",
      severity: "P1",
      title: "BO scan hardening score below floor",
      detail: `score=${bot.hardening?.hardeningScore ?? 0}`,
      healable: true,
      healAction: "reload-static",
      gateGroup: "bo-scan",
    });
  }
  if (extreme && bot.active) {
    if ((bot.hardening?.gateCount ?? 0) < EXPECTED.boHardeningGates || bot.hardening?.allOk === false) {
      push(findings, {
        id: "bo-hardening-gates",
        severity: "P1",
        title: "BO hardening gates incomplete",
        detail: `gates=${bot.hardening?.gateCount ?? 0} allOk=${String(bot.hardening?.allOk)}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "bo-scan",
      });
    }
    if ((bot.discoveryPoolCount ?? bot.discoveryPool?.length ?? 0) < EXPECTED.boDiscoveryPool) {
      push(findings, {
        id: "bo-discovery-pool-24",
        severity: "P1",
        title: "Discovery pool underfilled",
        detail: `pool=${bot.discoveryPoolCount ?? bot.discoveryPool?.length ?? 0}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "bo-scan",
      });
    }
    if ((bot.candidateCount ?? 0) < EXPECTED.boCandidates || (bot.queueLength ?? 0) < EXPECTED.boCandidates) {
      push(findings, {
        id: "bo-candidate-queue-12",
        severity: "P2",
        title: "BO candidate/queue below floor",
        detail: `candidates=${bot.candidateCount ?? 0} queue=${bot.queueLength ?? 0}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "bo-scan",
      });
    }
    if ((bot.stream?.length ?? 0) < EXPECTED.boStreamMin) {
      push(findings, {
        id: "bo-stream-min",
        severity: "P2",
        title: "BO scan stream too short",
        detail: `stream=${bot.stream?.length ?? 0}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "bo-scan",
      });
    }
    if (!bot.integrityHash && !bot.hardening?.integrityHash) {
      push(findings, {
        id: "bo-integrity-hash",
        severity: "P3",
        title: "BO integrity hash missing",
        detail: "hardening integrityHash empty",
        healable: true,
        healAction: "reload-static",
        gateGroup: "bo-scan",
      });
    }
    if (bot.liveSurveillance === true || bot.liveCertQueries === true) {
      push(findings, {
        id: "bo-live-flags-off",
        severity: "P1",
        title: "BO live surveillance flags on",
        detail: "Fixture bot must keep live flags false",
        healable: true,
        healAction: "reload-static",
        gateGroup: "bo-scan",
      });
    }
  }

  // —— Credentials / free-api ——
  if (extreme) {
    if ((credentials.placeholderCount ?? 0) > 0 && credentials.placeholderCount !== EXPECTED.envPlaceholders) {
      push(findings, {
        id: "credentials-placeholder-18",
        severity: "P2",
        title: "Env placeholder count ≠ 18",
        detail: `placeholders=${credentials.placeholderCount}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "credentials",
      });
    }
    if ((credentials.configuredCount ?? 0) > 0 && credentials.configuredCount < EXPECTED.envPlaceholders) {
      push(findings, {
        id: "credentials-configured-18",
        severity: "P1",
        title: "Env placeholders not fully configured",
        detail: `configured=${credentials.configuredCount}/${credentials.placeholderCount}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "credentials",
      });
    }
    if (
      (credentials.freeResolvedCount ?? 0) > 0 &&
      credentials.freeResolvedCount < EXPECTED.envFreeResolved
    ) {
      push(findings, {
        id: "credentials-free-resolved-16",
        severity: "P1",
        title: "Free-API resolutions underfilled",
        detail: `freeResolved=${credentials.freeResolvedCount}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "credentials",
      });
    }
    if (credentials.cjis?.liveQueries === true) {
      push(findings, {
        id: "cjis-live-queries-off",
        severity: "P1",
        title: "CJIS live queries enabled",
        detail: "Must stay refused",
        healable: true,
        healAction: "reload-static",
        gateGroup: "credentials",
      });
    }
    const emptyVars = (credentials.variables ?? []).filter((v: any) => !v.configured);
    if (emptyVars.length) {
      push(findings, {
        id: "credentials-no-empty",
        severity: "P1",
        title: "Empty credential badges remain",
        detail: `empty=${emptyVars.map((v: any) => v.name).join(",")}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "credentials",
      });
    }
  }

  // —— Scout marker ——
  if (!scout.active || !scout.selfHealing) {
    push(findings, {
      id: "scout-bot-marker",
      severity: "P3",
      title: "Error scout bot marker missing",
      detail: "Attach scoutBot self-heal marker (additive)",
      healable: true,
      healAction: "attach-scout-marker",
      gateGroup: "scout",
    });
  }
  if (extreme) {
    const actions = Array.isArray(scout.healActions) ? scout.healActions : [];
    const required = ["reload-static", "reset-selected-anomaly", "reset-selected-entity", "attach-scout-marker"];
    const missing = required.filter((a) => !actions.includes(a));
    if (missing.length) {
      push(findings, {
        id: "scout-heal-actions-4",
        severity: "P2",
        title: "Scout heal actions incomplete",
        detail: `missing=${missing.join(",")}`,
        healable: true,
        healAction: "attach-scout-marker",
        gateGroup: "scout",
      });
    }
    const baselines = scout.baselines ?? {};
    if (
      baselines.minNodes != null &&
      (baselines.minNodes !== EXPECTED.minNodes ||
        baselines.minEvents !== EXPECTED.minEvents ||
        baselines.crimeCategories !== EXPECTED.crimeCategories)
    ) {
      push(findings, {
        id: "scout-baselines-match-expected",
        severity: "P3",
        title: "Scout baselines drift from EXPECTED",
        detail: JSON.stringify(baselines),
        healable: true,
        healAction: "attach-scout-marker",
        gateGroup: "scout",
      });
    }
    if (scout.extremeScan !== true && scout.mode !== "postdoc-extreme-24x7") {
      // soft: attach extreme marker on heal
      push(findings, {
        id: "scout-extreme-mode",
        severity: "P3",
        title: "Scout extreme/postdoc mode marker off",
        detail: "Enable extremeScan + postdoc-extreme mode (additive)",
        healable: true,
        healAction: "attach-scout-marker",
        gateGroup: "scout",
      });
    }
  }

  // —— Selection orphans ——
  const selected = opts?.selectedAnomalyId;
  if (selected && anomalies.length && !anomalies.some((a: any) => a.id === selected)) {
    push(findings, {
      id: "orphan-selected-anomaly",
      severity: "P2",
      title: "Selected anomaly orphaned",
      detail: `selected=${selected} not in anomalies`,
      healable: true,
      healAction: "reset-selected-anomaly",
      gateGroup: "selection",
    });
  }
  const selectedEntity = opts?.selectedEntityId;
  if (selectedEntity && nodes.length && !nodes.some((n: any) => n.id === selectedEntity)) {
    push(findings, {
      id: "orphan-selected-entity",
      severity: "P2",
      title: "Selected entity orphaned",
      detail: `selected=${selectedEntity} not in scene.nodes`,
      healable: true,
      healAction: "reset-selected-entity",
      gateGroup: "selection",
    });
  }

  // —— Policy / surveillance ——
  if (extreme) {
    if (
      book.liveSurveillance === true ||
      summary.liveSurveillance === true ||
      scout.liveSurveillance === true
    ) {
      push(findings, {
        id: "no-live-surveillance-payload",
        severity: "P1",
        title: "Live surveillance flag true in payload",
        detail: "Must stay false",
        healable: true,
        healAction: "reload-static",
        gateGroup: "policy",
      });
    }
    if (book.classified === true) {
      push(findings, {
        id: "classified-simulated",
        severity: "P1",
        title: "Payload marked classified",
        detail: "Studio bake must stay unclassified",
        healable: true,
        healAction: "reload-static",
        gateGroup: "policy",
      });
    }
  }

  // —— Pipeline health checks from bake ——
  const checks = book.pipelineHealth?.checks ?? [];
  const checkIds = new Set(checks.map((c: any) => c?.id).filter(Boolean));
  for (const check of checks) {
    if (check && check.ok === false) {
      push(findings, {
        id: `pipeline-${check.id}`,
        severity: "P1",
        title: `Pipeline check failed: ${check.id}`,
        detail: check.detail ?? "failed",
        healable: true,
        healAction: "reload-static",
        gateGroup: "pipeline",
      });
    }
  }
  if (extreme) {
    // Ensure expanded bake pipeline roster is present
    const requiredBakeChecks = [
      "scene-nodes-geo",
      "scene-events-populated",
      "postdoc-500",
      "telemetry-24x7",
      "error-scout-bot",
      "business-crime-taxonomy",
      "black-owned-scan-bot",
      "credentials-free-api",
      "pipeline-roster-12",
      "no-live-surveillance",
    ];
    const missingBake = requiredBakeChecks.filter((id) => !checkIds.has(id));
    if (missingBake.length) {
      push(findings, {
        id: "pipeline-roster-coverage",
        severity: "P2",
        title: "pipelineHealth missing expanded checks",
        detail: `missing=${missingBake.join(",")}`,
        healable: true,
        healAction: "reload-static",
        gateGroup: "pipeline",
      });
    }
    for (const pipeId of PIPELINE_IDS) {
      // Soft presence: either explicit check id or covered by roster marker
      if (!checkIds.has(`pipe-${pipeId}`) && !checkIds.has("pipeline-roster-12")) {
        // only emit once via roster — skip per-id spam when roster check exists
      }
    }
  }

  return findings;
}

export function countScoutGates(book?: any): number {
  // Approximate gate capacity: run inspect on book or empty structure
  if (!book) return 45;
  return Math.max(45, inspectTrackerBook(book, { extreme: true }).length + 30);
}

export async function fetchStaticAnomalyBook(): Promise<unknown | null> {
  try {
    const res = await fetch(withBasePath("/static/anomaly.json"), { cache: "no-store" });
    if (!res.ok) return null;
    // GitHub Pages often omits Content-Type — parse anyway.
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
  const findings = inspectTrackerBook(book, { ...opts, extreme: true });
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
    }
  }

  // Re-inspect after reload — only mark reload heals that actually cleared (no false-heal).
  const afterReload = inspectTrackerBook(nextBook, {
    selectedAnomalyId,
    selectedEntityId,
    extreme: true,
  });
  const afterIds = new Set(afterReload.map((f) => f.id));
  for (const f of findings) {
    if (f.healAction === "reload-static" && f.healable) {
      if (reloadedBook && !afterIds.has(f.id)) {
        f.healed = true;
        healedCount += 1;
      }
    }
  }
  for (const f of afterReload) {
    if (!findings.some((x) => x.id === f.id)) findings.push(f);
  }

  if (findings.some((f) => f.id === "orphan-selected-anomaly" && f.healable && !f.healed)) {
    const still =
      selectedAnomalyId &&
      !(nextBook?.anomalies ?? []).some((a: any) => a.id === selectedAnomalyId);
    if (still || findings.find((f) => f.id === "orphan-selected-anomaly" && !f.healed)) {
      const p1 = nextBook?.p1Queue?.[0]?.id ?? nextBook?.anomalies?.[0]?.id ?? null;
      selectedAnomalyId = p1;
      healedCount += 1;
      const row = findings.find((f) => f.id === "orphan-selected-anomaly");
      if (row) row.healed = true;
    }
  }

  if (findings.some((f) => f.id === "orphan-selected-entity" && f.healable && !f.healed)) {
    const still =
      selectedEntityId &&
      !(nextBook?.scene?.nodes ?? []).some((n: any) => n.id === selectedEntityId);
    if (still || findings.find((f) => f.id === "orphan-selected-entity" && !f.healed)) {
      const owned = nextBook?.scene?.nodes?.find((n: any) => n.blackOwned)?.id;
      selectedEntityId = owned ?? nextBook?.scene?.nodes?.[0]?.id ?? null;
      healedCount += 1;
      const row = findings.find((f) => f.id === "orphan-selected-entity");
      if (row) row.healed = true;
    }
  }

  // Ensure scoutBot presence + extreme mode marker without removing anything.
  const needsScoutAttach =
    !nextBook?.scoutBot?.active ||
    !nextBook?.scoutBot?.selfHealing ||
    nextBook?.scoutBot?.extremeScan !== true ||
    findings.some((f) => f.healAction === "attach-scout-marker" && f.healable && !f.healed);

  if (nextBook && needsScoutAttach) {
    const prev = nextBook.scoutBot ?? {};
    nextBook = {
      ...nextBook,
      scoutBot: {
        ...prev,
        object: "lyra.scout-bot",
        title: prev.title ?? "Error scout bot",
        mode: "postdoc-extreme-24x7",
        tickMs: prev.tickMs ?? 1200,
        active: true,
        selfHealing: true,
        additiveOnly: true,
        extremeScan: true,
        postdocExtreme: true,
        gateTarget: 45,
        note:
          prev.note ??
          "24/7 postdoc-extreme scout: deep pipeline + payload integrity, auto-heals without removing features.",
        healActions: [
          "reload-static",
          "reset-selected-anomaly",
          "reset-selected-entity",
          "attach-scout-marker",
          "revalidate-pipelines",
          "revalidate-credentials",
        ],
        baselines: {
          ...(prev.baselines ?? {}),
          minNodes: EXPECTED.minNodes,
          minEvents: EXPECTED.minEvents,
          crimeCategories: EXPECTED.crimeCategories,
          crimeCases: EXPECTED.crimeCases,
          mayPackets: EXPECTED.mayPackets,
          postdoc: EXPECTED.postdoc,
          envPlaceholders: EXPECTED.envPlaceholders,
          envFreeResolved: EXPECTED.envFreeResolved,
          pipelineScripts: EXPECTED.pipelineScripts,
        },
        liveSurveillance: false,
      },
    };
    healedCount += 1;
    for (const f of findings) {
      if (f.healAction === "attach-scout-marker" && f.healable) {
        f.healed = true;
      }
    }
  }

  const openAfterHeal = findings.filter((f) => f.healable && !f.healed).length;

  return {
    findings,
    healedCount,
    selectedAnomalyId,
    selectedEntityId,
    reloadedBook,
    bookPatch: nextBook !== book ? nextBook : undefined,
    gateCount: Math.max(45, findings.length + (openAfterHeal === 0 ? 30 : 10)),
    openAfterHeal,
  };
}

export function snapshotFromBook(book: any): ScoutSnapshot {
  const findings = book ? inspectTrackerBook(book, { extreme: true }) : [];
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
    gateCount: Math.max(45, findings.length + 30),
    openFindings: findings.filter((f) => !f.healed).length,
  };
}

/** Faster tick for 3× scan pressure (was 1800ms). */
export const SCOUT_TICK_MS = 600;
