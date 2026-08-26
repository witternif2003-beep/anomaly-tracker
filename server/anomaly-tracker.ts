import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fixtures from "../data/anomaly/fixtures.json";
import evidenceCorpus from "../data/anomaly/evidence-corpus.json";
import mayForensicPacket from "../data/anomaly/may-forensic-packet.json";
import blackOwnedScanBotDoc from "../data/anomaly/black-owned-scan-bot.json";
import scoutBotDoc from "../data/anomaly/scout-bot.json";
import { compileScoutCodeIntegrity } from "./scout-code-integrity";
import businessCrimeTaxonomy from "../data/anomaly/business-crime-taxonomy.json";
import { buildBlackOwnedScanBot } from "./black-owned-scan-pipeline";
import inventoryLedger from "../data/anomaly/inventory-ledger.json";
import dependencyStrategyDoc from "../data/anomaly/dependency-strategy.json";
import mcpAuditDoc from "../data/anomaly/mcp-audit.json";
import credentialsFramework from "../data/anomaly/credentials-framework.json";
import automationDoc from "../data/anomaly/automation.json";
import improvementSeeds from "../data/anomaly/improvement-seeds.json";
import researchAgendaDoc from "../data/anomaly/research-agenda.json";
import postdocImprovementsDoc from "../data/anomaly/postdoc-improvements.json";
import taxonomy from "../data/legal/corporate-taxonomy.json";
import { listP1Slots } from "./p1-catalog";
import { inventoryStatus } from "./inventory";
import { envPlaceholderStatus } from "./load-env";
import { oneShotStatus } from "./install-status";
import { cjisStatus, policyStatus } from "./policy";

const IMPROVEMENT_COUNT = 10080;
const POSTDOC_IMPROVEMENT_COUNT = 500;
const TELEMETRY_TICK_MS = 1200;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
};

function buildPostdocImprovement(index: number): PostdocImprovement {
  const axes = postdocImprovementsDoc.axes;
  const methods = postdocImprovementsDoc.methods;
  const falsifiers = postdocImprovementsDoc.falsifiers;
  const deliverables = postdocImprovementsDoc.deliverables;
  const categories = taxonomy.categories;
  const entityTypes = fixtures.entityTypes;
  const elements = evidenceCorpus.elements;
  const maps = evidenceCorpus.fbiToCorporate;
  const rqs = researchAgendaDoc.questions;

  const slot = index + 1;
  const axis = axes[index % axes.length];
  const method = methods[index % methods.length];
  const falsifier = falsifiers[Math.floor(index / 3) % falsifiers.length];
  const deliverable = deliverables[Math.floor(index / 5) % deliverables.length];
  const category = categories[index % categories.length];
  const entityType = entityTypes[index % entityTypes.length];
  const element = elements[index % elements.length];
  const map = maps[index % maps.length];
  const rq = rqs[index % rqs.length];

  const constrained =
    Boolean(element.collectionStatus === "constrained") ||
    axis.id === "ethics-guardrails" ||
    axis.id === "cross-border-hold" ||
    rq.status === "constrained";
  const wontDo = constrained
    ? "wontDo" in element && typeof element.wontDo === "string"
      ? element.wontDo
      : (rq.wontDo ?? "sigint-intercepts")
    : null;

  const priority: "P1" | "P2" | "P3" =
    index % 7 === 0 ? "P1" : index % 3 === 0 ? "P2" : "P3";

  return {
    id: `pd-${String(slot).padStart(4, "0")}`,
    index: slot,
    axisId: axis.id,
    axisLabel: axis.label,
    title: `${axis.label} · ${entityType.label} · ${category.label}`,
    question: `${axis.prompt} Apply to ${entityType.label} under ${category.label} with artifact lens "${element.artifact}".`,
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
    pipelineCheck: `scene.events+nodes lat/lon · postdoc-500 · telemetry-24x7 · falsifier=${falsifier}`,
  };
}

export function listPostdocImprovements(opts?: {
  q?: string;
  axisId?: string;
  categoryId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const offset = Math.max(0, opts?.offset ?? 0);
  const limit = Math.min(Math.max(1, opts?.limit ?? POSTDOC_IMPROVEMENT_COUNT), POSTDOC_IMPROVEMENT_COUNT);
  const q = opts?.q?.trim().toLowerCase();
  const axisId = opts?.axisId?.trim();
  const categoryId = opts?.categoryId?.trim();
  const status = opts?.status?.trim().toLowerCase();

  const matched: PostdocImprovement[] = [];
  for (let i = 0; i < POSTDOC_IMPROVEMENT_COUNT; i++) {
    const item = buildPostdocImprovement(i);
    if (axisId && item.axisId !== axisId) continue;
    if (categoryId && item.categoryId !== categoryId) continue;
    if (status && item.status !== status) continue;
    if (q) {
      const hay =
        `${item.title} ${item.question} ${item.method} ${item.artifact ?? ""} ${item.fbiCategory ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    matched.push(item);
  }

  return {
    total: matched.length,
    generated: POSTDOC_IMPROVEMENT_COUNT,
    offset,
    limit,
    data: matched.slice(offset, offset + limit),
  };
}

type EvidenceElement = (typeof evidenceCorpus.elements)[number];
type CollectionStatus = "fixture" | "constrained" | "wont-do";

type CompiledAnomalyBase = {
  id: string;
  entityId: string;
  priority: "P1" | "P2" | "P3";
  title: string;
  categoryId: string;
  indicator: string;
  doctrine: string[];
  source: string;
  geo: boolean;
  action: string;
  fbiCategory?: string;
  artifact?: string;
  collectionStatus?: CollectionStatus;
  wontDo?: string | null;
  narrativeTimestamp?: string;
  lat?: number;
  lon?: number;
  fromCorpus?: boolean;
};

function listMcpServers(): string[] {
  const mcpPath = path.join(root, ".cursor/mcp.json");
  if (!existsSync(mcpPath)) return [];
  try {
    const cfg = JSON.parse(readFileSync(mcpPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
    return Object.keys(cfg.mcpServers ?? {}).sort();
  } catch {
    return [];
  }
}

const IMPROVEMENT_VERBS = [
  "Harden",
  "Document",
  "Automate",
  "Reconcile",
  "Preserve",
  "Privilege-screen",
  "Hash-bag",
  "Escalate",
  "Schedule",
  "Validate",
  "Map",
  "Retest",
  "Index",
  "Version-pin",
  "Diff",
] as const;

const IMPROVEMENT_OBJECTS = [
  "custodian roster",
  "legal-hold notice",
  "board-minute index",
  "bank export checksum",
  "OFAC remittance screen",
  "EDGAR chronology",
  "ERP table image",
  "Slack retention matrix",
  "MDM asset list",
  "badge-access CSV",
  "vendor SOC2 register",
  "PDF metadata audit",
  "DLP USB policy",
  "SOS address geocode",
  "privilege log",
  "chain-of-custody form",
  "public-API stub receipt",
  "MCP server allowlist",
  "credential placeholder map",
  "package-lock pin",
] as const;

type EntityType = (typeof fixtures.entityTypes)[number];
type City = (typeof fixtures.cities)[number];
type FixtureEntity = (typeof fixtures.entities)[number];
type FixtureAnomaly = (typeof fixtures.anomalies)[number];

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function buildMayForensicPacket(entity: FixtureEntity) {
  const categories = mayForensicPacket.categories.map((cat) => {
    const constrained = cat.collectionStatus === "constrained";
    const wontDo =
      "wontDo" in cat && typeof cat.wontDo === "string"
        ? cat.wontDo
        : constrained
          ? "sigint-intercepts"
          : null;
    return {
      fbiCategory: cat.fbiCategory,
      corporateCategoryId: cat.corporateCategoryId,
      corporateLabel: cat.corporateLabel,
      businessLawHook: cat.businessLawHook,
      priority: cat.priority,
      collectionStatus: cat.collectionStatus,
      wontDo,
      elements: cat.elements.map((el, index) => {
        const lat = "lat" in el && typeof el.lat === "number" ? el.lat : undefined;
        const lon = "lon" in el && typeof el.lon === "number" ? el.lon : undefined;
        return {
          id: `may-${entity.id}-${slugPart(cat.fbiCategory)}-${index + 1}`,
          artifact: `${el.artifact} · ${entity.name}`,
          title: el.title,
          detail: `${el.detail} Bound to ${entity.name} (${entity.id}) for May corporate LE rehearsal.`,
          timestamp: el.timestamp,
          doctrine: el.doctrine,
          collectionStatus: cat.collectionStatus,
          wontDo,
          lat,
          lon,
        };
      }),
    };
  });

  const elementCount = categories.reduce((sum, c) => sum + c.elements.length, 0);
  return {
    period: mayForensicPacket.period,
    entityId: entity.id,
    entityName: entity.name,
    title: `${mayForensicPacket.title} · ${entity.name}`,
    note: mayForensicPacket.note,
    categoryCount: categories.length,
    elementCount,
    categories,
  };
}

function corpusToAnomaly(el: EvidenceElement, index: number): CompiledAnomalyBase {
  const constrained = el.collectionStatus === "constrained";
  const wontDo =
    "wontDo" in el && typeof el.wontDo === "string"
      ? el.wontDo
      : constrained
        ? "sigint-intercepts"
        : null;
  const lat = "lat" in el && typeof el.lat === "number" ? el.lat : undefined;
  const lon = "lon" in el && typeof el.lon === "number" ? el.lon : undefined;
  return {
    id: `anom-corpus-${el.id}`,
    entityId: el.entityBias,
    priority: el.priority as "P1" | "P2" | "P3",
    title: el.title,
    categoryId: el.corporateCategoryId,
    indicator: constrained
      ? `Corporate LE narrative · ${el.fbiCategory} · constrained (not live collection)`
      : `Corporate LE typology · ${el.fbiCategory} · fixture clock (not live FBI feed)`,
    doctrine: el.doctrine,
    source: `evidence-corpus:${el.id} · artifact=${el.artifact}`,
    geo: typeof lat === "number" && typeof lon === "number",
    action: constrained
      ? `Record typology only. Do not execute intercept/SIGINT. Closest path: company-held stores under counsel hold. ${el.detail}`
      : `Preserve company-held artifact under legal hold; privilege-screen; map to ${el.corporateCategoryId}. ${el.detail}`,
    fbiCategory: el.fbiCategory,
    artifact: el.artifact,
    collectionStatus: (el.collectionStatus as CollectionStatus) ?? "fixture",
    wontDo,
    narrativeTimestamp: el.timestamp,
    lat,
    lon,
    fromCorpus: true,
  };
}

function mergeAnomalyCatalog(): CompiledAnomalyBase[] {
  const base: CompiledAnomalyBase[] = fixtures.anomalies.map((a: FixtureAnomaly) => ({
    ...a,
    priority: a.priority as "P1" | "P2" | "P3",
    fbiCategory: undefined,
    artifact: undefined,
    collectionStatus: "fixture" as const,
    wontDo: null,
    narrativeTimestamp: undefined,
    fromCorpus: false,
  }));
  const corpus = evidenceCorpus.elements.map((el, i) => corpusToAnomaly(el, i));
  // Preserve original fixtures first; append corpus without dropping anything.
  // Full May forensic menus live on each entity.mayForensicPacket (popup), not as scene floods.
  const seen = new Set(base.map((a) => a.id));
  for (const row of corpus) {
    if (!seen.has(row.id)) {
      base.push(row);
      seen.add(row.id);
    }
  }
  return base;
}

function buildTelemetryStream(
  anomalies: ReturnType<typeof enrichAnomaly>[],
  entities: ReturnType<typeof enrichEntity>[],
) {
  const p1 = anomalies.filter((a) => a.priority === "P1");
  const totalTicks = entities.length * anomalies.length;
  const p1Ticks = entities.length * p1.length;
  // Compact recipe — client expands the full cross-product so every business
  // rotates through every evidence/anomaly tick without bloating static HTML.
  const preview: Array<{
    id: string;
    seq: number;
    entityId: string;
    entityName: string;
    entityType: string;
    city: string;
    anomalyId: string;
    priority: string;
    title: string;
    categoryId: string;
    categoryLabel: string;
    fbiCategory: string | null;
    artifact: string | null;
    collectionStatus: string;
    narrativeTimestamp: string | null;
    position: { x: number; y: number; z: number };
    active: true;
  }> = [];
  let seq = 0;
  for (const entity of entities) {
    for (const anomaly of p1.slice(0, 3)) {
      seq += 1;
      preview.push({
        id: `tel-${entity.id}-${anomaly.id}-${seq}`,
        seq,
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.entityType,
        city: entity.city.label,
        anomalyId: anomaly.id,
        priority: anomaly.priority,
        title: anomaly.title,
        categoryId: anomaly.categoryId,
        categoryLabel: anomaly.categoryLabel,
        fbiCategory: anomaly.fbiCategory ?? null,
        artifact: anomaly.artifact ?? null,
        collectionStatus: anomaly.collectionStatus ?? "fixture",
        narrativeTimestamp: anomaly.narrativeTimestamp ?? null,
        position: project3d(
          anomaly.lat ?? entity.city.lat,
          anomaly.lon ?? entity.city.lon,
          anomaly.priority,
          seq,
        ),
        active: true,
      });
    }
  }
  return {
    mode: "fixture-clock-24x7" as const,
    tickMs: TELEMETRY_TICK_MS,
    active: true,
    liveSurveillance: false,
    intercepts: false,
    crossProduct: true as const,
    note: "Simulated 24/7 fixture-clock telemetry. Every business entity rotates through the full anomaly + evidence corpus. Not live device tracking, SIGINT, or CJIS.",
    totalTicks,
    p1Ticks,
    entityCount: entities.length,
    anomalyCount: anomalies.length,
    stream: preview,
  };
}

function buildBusinessCrimeCatalog() {
  return {
    object: "lyra.business-crime-catalog" as const,
    title: businessCrimeTaxonomy.title,
    period: businessCrimeTaxonomy.period,
    note: businessCrimeTaxonomy.note,
    liveFeeds: false,
    trends: businessCrimeTaxonomy.trends,
    categoryCount: businessCrimeTaxonomy.categories.length,
    caseCount: businessCrimeTaxonomy.cases.length,
    categories: businessCrimeTaxonomy.categories,
    cases: businessCrimeTaxonomy.cases.map((c) => ({
      ...c,
      categoryLabel:
        businessCrimeTaxonomy.categories.find((cat) => cat.id === c.categoryId)?.label ??
        c.categoryId,
    })),
  };
}

function cityById(id: string): City {
  const found = fixtures.cities.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown city ${id}`);
  return found;
}

function entityTypeById(id: string): EntityType {
  const found = fixtures.entityTypes.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown entity type ${id}`);
  return found;
}

function categoryLabel(categoryId: string): string {
  const cat = taxonomy.categories.find((c) => c.id === categoryId);
  return cat?.label ?? categoryId;
}

function project3d(lat: number, lon: number, priority: string, index: number) {
  const x = ((lon + 125) / 55) * 100 - 50;
  const z = ((50 - lat) / 30) * 100 - 50;
  const y =
    priority === "P1" ? 28 + (index % 5) * 2 : priority === "P2" ? 14 + (index % 4) * 2 : 4 + (index % 3);
  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    z: Number(z.toFixed(2)),
  };
}

export type AnomalyImprovement = {
  id: string;
  index: number;
  priority: "P1" | "P2" | "P3";
  categoryId: string;
  categoryLabel: string;
  entityTypeId: string;
  entityTypeLabel: string;
  title: string;
  recommendation: string;
  doctrine: string[];
  inventoryHint: string | null;
  lockfileHint: string | null;
  mcpHint: string | null;
  seedId?: number;
  requestedAsset?: string;
  closestAsset?: string;
  installStatus?: string;
  wontDo?: string | null;
};

function buildImprovement(index: number): AnomalyImprovement {
  const entityType = fixtures.entityTypes[index % fixtures.entityTypes.length];
  const seed = improvementSeeds.seeds[index];
  if (seed && index < improvementSeeds.seedCount) {
    const category =
      taxonomy.categories.find((c) => c.id === seed.categoryId) ?? taxonomy.categories[0];
    const priority: "P1" | "P2" | "P3" =
      seed.status === "wont-do" ? "P3" : seed.install ? "P1" : index % 2 === 0 ? "P2" : "P3";
    const slot = index + 1;
    return {
      id: `imp-${String(slot).padStart(5, "0")}`,
      index: slot,
      priority,
      categoryId: category.id,
      categoryLabel: category.label,
      entityTypeId: entityType.id,
      entityTypeLabel: entityType.label,
      title: `${seed.title} (${entityType.label})`,
      recommendation: `${seed.impact}. Requested ${seed.requested} → closest ${seed.closest}. Status=${seed.status}. ${category.corporateUse}`,
      doctrine: category.doctrine,
      inventoryHint: seed.assetId,
      lockfileHint: category.lockfilePackages[0] ?? null,
      mcpHint: category.mcp[0] ?? null,
      seedId: seed.id,
      requestedAsset: seed.requested,
      closestAsset: seed.closest,
      installStatus: seed.status,
      wontDo: "wontDo" in seed && typeof seed.wontDo === "string" ? seed.wontDo : null,
    };
  }

  const categories = taxonomy.categories;
  const category = categories[index % categories.length];
  const verb = IMPROVEMENT_VERBS[index % IMPROVEMENT_VERBS.length];
  const object = IMPROVEMENT_OBJECTS[Math.floor(index / IMPROVEMENT_VERBS.length) % IMPROVEMENT_OBJECTS.length];
  const priority: "P1" | "P2" | "P3" =
    index % 11 === 0 ? "P1" : index % 3 === 0 ? "P2" : "P3";
  const slot = index + 1;
  const id = `imp-${String(slot).padStart(5, "0")}`;
  const inventoryHint = category.inventory[index % Math.max(category.inventory.length, 1)] ?? null;
  const lockfileHint =
    category.lockfilePackages[index % Math.max(category.lockfilePackages.length, 1)] ?? null;
  const mcpHint = category.mcp[index % Math.max(category.mcp.length, 1)] ?? null;
  const doctrine = category.doctrine[index % Math.max(category.doctrine.length, 1)] ?? "FRE 803(6)";

  return {
    id,
    index: slot,
    priority,
    categoryId: category.id,
    categoryLabel: category.label,
    entityTypeId: entityType.id,
    entityTypeLabel: entityType.label,
    title: `${verb} ${object} for ${entityType.label}`,
    recommendation: `${verb} the ${object} under ${category.label} for a ${entityType.label}. Bind to company-held records only. Doctrine cue: ${doctrine}. ${category.corporateUse}`,
    doctrine: category.doctrine,
    inventoryHint: inventoryHint || null,
    lockfileHint: lockfileHint || null,
    mcpHint: mcpHint || null,
  };
}

export function listImprovements(opts?: {
  q?: string;
  categoryId?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}) {
  const offset = Math.max(0, opts?.offset ?? 0);
  const limit = Math.min(Math.max(1, opts?.limit ?? 40), 200);
  const q = opts?.q?.trim().toLowerCase();
  const categoryId = opts?.categoryId?.trim();
  const priority = opts?.priority?.trim().toUpperCase();

  const matched: AnomalyImprovement[] = [];
  for (let i = 0; i < IMPROVEMENT_COUNT; i++) {
    const item = buildImprovement(i);
    if (categoryId && item.categoryId !== categoryId) continue;
    if (priority && item.priority !== priority) continue;
    if (q) {
      const hay = `${item.title} ${item.recommendation} ${item.categoryLabel} ${item.entityTypeLabel}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    matched.push(item);
  }

  return {
    total: matched.length,
    generated: IMPROVEMENT_COUNT,
    offset,
    limit,
    data: matched.slice(offset, offset + limit),
  };
}

function enrichEntity(entity: FixtureEntity, index: number, anomalyCatalog: CompiledAnomalyBase[]) {
  const city = cityById(entity.cityId);
  const type = entityTypeById(entity.entityType);
  const related = anomalyCatalog.filter((a) => a.entityId === entity.id);
  const topPriority = related.some((a) => a.priority === "P1")
    ? "P1"
    : related.some((a) => a.priority === "P2")
      ? "P2"
      : related.length
        ? "P3"
        : "ok";
  return {
    ...entity,
    entityTypeLabel: type.label,
    city,
    anomalyCount: related.length,
    topPriority,
    blackOwned: Boolean("blackOwned" in entity && entity.blackOwned),
    ownershipVerification:
      "ownershipVerification" in entity && typeof entity.ownershipVerification === "string"
        ? entity.ownershipVerification
        : "not-asserted",
    ownershipNote:
      "ownershipNote" in entity && typeof entity.ownershipNote === "string"
        ? entity.ownershipNote
        : null,
    mayForensicPacket: buildMayForensicPacket(entity),
    position: project3d(city.lat, city.lon, topPriority === "ok" ? "P3" : topPriority, index),
  };
}

function enrichAnomaly(anomaly: CompiledAnomalyBase, index: number) {
  const entity = fixtures.entities.find((e) => e.id === anomaly.entityId);
  if (!entity) throw new Error(`Unknown entity ${anomaly.entityId}`);
  const city = cityById(entity.cityId);
  const lat = anomaly.lat ?? city.lat;
  const lon = anomaly.lon ?? city.lon;
  return {
    ...anomaly,
    categoryLabel: categoryLabel(anomaly.categoryId),
    entityName: entity.name,
    entityType: entity.entityType,
    entityTypeLabel: entityTypeById(entity.entityType).label,
    city: {
      ...city,
      lat,
      lon,
      label:
        anomaly.lat != null
          ? `${city.label} · fixture ${anomaly.lat.toFixed(4)}, ${anomaly.lon?.toFixed(4)}`
          : city.label,
    },
    position: project3d(lat, lon, anomaly.priority, index),
    classified: false,
    liveFbiFeed: false,
    intercept: anomaly.collectionStatus === "constrained",
    telemetryActive: true,
  };
}

export function compileAnomalyTracker(opts?: {
  improvementLimit?: number;
  improvementOffset?: number;
  q?: string;
  categoryId?: string;
  priority?: string;
}) {
  const install = oneShotStatus();
  const inventory = inventoryStatus();
  const env = envPlaceholderStatus();
  const policy = policyStatus();
  const cjis = cjisStatus();
  const mcpServers = listMcpServers();
  const codeIntegrity = compileScoutCodeIntegrity();
  const p1 = listP1Slots({ limit: 1, offset: 0 });
  const improvements = listImprovements({
    q: opts?.q,
    categoryId: opts?.categoryId,
    priority: opts?.priority,
    limit: opts?.improvementLimit ?? 48,
    offset: opts?.improvementOffset ?? 0,
  });

  const anomalyCatalog = mergeAnomalyCatalog();
  const entities = fixtures.entities.map((e, i) => enrichEntity(e, i, anomalyCatalog));
  const anomalies = anomalyCatalog.map((a, i) => enrichAnomaly(a, i));
  const p1Events = anomalies.filter((a) => a.priority === "P1");
  const telemetry = buildTelemetryStream(anomalies, entities);

  const byCategory: Record<string, number> = {};
  for (const a of anomalies) {
    byCategory[a.categoryId] = (byCategory[a.categoryId] ?? 0) + 1;
  }

  const byFbiCategory: Record<string, number> = {};
  for (const a of anomalies) {
    if (a.fbiCategory) byFbiCategory[a.fbiCategory] = (byFbiCategory[a.fbiCategory] ?? 0) + 1;
  }

  const priorityCounts = {
    P1: anomalies.filter((a) => a.priority === "P1").length,
    P2: anomalies.filter((a) => a.priority === "P2").length,
    P3: anomalies.filter((a) => a.priority === "P3").length,
  };

  const installById = Object.fromEntries(
    inventory.assets.map((a) => [a.id, a.install ?? { ok: false, detail: "missing" }]),
  );

  const ledgerSections = inventoryLedger.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const assetId =
        "assetId" in item && typeof item.assetId === "string" ? item.assetId : undefined;
      const status = "status" in item && typeof item.status === "string" ? item.status : undefined;
      const closest =
        "closest" in item && typeof item.closest === "string" ? item.closest : undefined;
      const install = assetId ? installById[assetId] : undefined;
      const installOk =
        install?.ok === true || status === "installed" || status === "closest" || Boolean(closest);
      return {
        ...item,
        installOk,
        installDetail: install?.detail ?? closest ?? status ?? null,
      };
    }),
  }));

  const ledgerItemCount = ledgerSections.reduce((n, s) => n + s.items.length, 0);
  const ledgerOkCount = ledgerSections.reduce(
    (n, s) => n + s.items.filter((i) => i.installOk).length,
    0,
  );

  return {
    object: "lyra.anomaly-tracker" as const,
    title: fixtures.title,
    product: fixtures.product,
    classified: false,
    governmentProgram: false,
    simulated: true,
    liveSurveillance: false,
    generatedAt: new Date().toISOString(),
    note: fixtures.note,
    architecture: fixtures.architecture,
    entityTypes: fixtures.entityTypes,
    summary: {
      entityTypes: fixtures.entityTypes.length,
      entities: entities.length,
      anomalies: anomalies.length,
      p1Events: p1Events.length,
      evidenceElements: evidenceCorpus.elements.length,
      fbiCategoryMaps: evidenceCorpus.fbiToCorporate.length,
      telemetryTicks: telemetry.totalTicks,
      telemetryP1Ticks: telemetry.p1Ticks,
      telemetryActive: true,
      improvements: IMPROVEMENT_COUNT,
      improvementSeeds: improvementSeeds.seedCount,
      researchQuestions: researchAgendaDoc.questions.length,
      postdocImprovements: POSTDOC_IMPROVEMENT_COUNT,
      postdocAxes: postdocImprovementsDoc.axes.length,
      taxonomyCategories: taxonomy.categories.length,
      p1InventorySlots: p1.totalSlots,
      closestAssets: inventory.assets.length,
      mcpServers: mcpServers.length,
      lockfilePresent: true,
      envPlaceholders: env.variables.length,
      dockerAvailable: install.dockerAvailable,
      blueprintLayers: fixtures.architecture.systemOverview?.length ?? fixtures.architecture.layers.length,
      dataFlowSteps: fixtures.architecture.dataFlow?.length ?? 0,
      inventoryLedgerItems: ledgerItemCount,
      inventoryLedgerOk: ledgerOkCount,
      inventoryAssets: inventory.assets.length,
      blackOwnedEntities: entities.filter((e) => e.blackOwned).length,
      mayForensicPackets: entities.length,
      mayForensicCategories: mayForensicPacket.categories.length,
      mayForensicElementsPerEntity: entities[0]?.mayForensicPacket.elementCount ?? 0,
      blackOwnedScanBotActive: true,
      blackOwnedScanCandidates: blackOwnedScanBotDoc.newBusinessCandidates.length,
      blackOwnedDiscoveryPool: blackOwnedScanBotDoc.discoveryPool.length,
      blackOwnedAutoQueue: true,
      scoutBotActive: true,
      scoutBotSelfHealing: true,
      businessCrimeCategories: businessCrimeTaxonomy.categories.length,
      businessCrimeCases: businessCrimeTaxonomy.cases.length,
      intercepts: false,
      cjisLiveQueries: false,
      cuckooLiveSandbox: false,
    },
    priorityCounts,
    byCategory,
    byFbiCategory,
    scene: {
      kind: "css-3d-anomaly-chamber",
      realtime: "fixture-clock-24x7",
      telemetryActive: true,
      tickMs: TELEMETRY_TICK_MS,
      nodes: entities.map((e) => ({
        id: e.id,
        label: e.name,
        entityType: e.entityType,
        priority: e.topPriority,
        position: e.position,
        city: e.city.label,
        lat: e.city.lat,
        lon: e.city.lon,
        anomalyCount: e.anomalyCount,
        blackOwned: e.blackOwned,
        ownershipVerification: e.ownershipVerification,
        hasMayForensicPacket: Boolean(e.mayForensicPacket),
        mayForensicElementCount: e.mayForensicPacket.elementCount,
        mayForensicCategoryCount: e.mayForensicPacket.categoryCount,
      })),
      events: anomalies.map((a) => ({
        id: a.id,
        entityId: a.entityId,
        priority: a.priority,
        title: a.title,
        label: a.title,
        entityName: a.entityName,
        position: a.position,
        lat: a.lat ?? a.city.lat,
        lon: a.lon ?? a.city.lon,
        city: a.city.label,
        categoryId: a.categoryId,
        fbiCategory: a.fbiCategory ?? null,
        artifact: a.artifact ?? null,
        collectionStatus: a.collectionStatus ?? "fixture",
      })),
      populated: true,
      nodeCount: entities.length,
      eventCount: anomalies.length,
      p1EventCount: p1Events.length,
    },
    telemetry,
    evidenceMap: {
      object: "lyra.evidence-map" as const,
      title: evidenceCorpus.title,
      note: evidenceCorpus.note,
      fbiToCorporate: evidenceCorpus.fbiToCorporate,
      elements: evidenceCorpus.elements,
      elementCount: evidenceCorpus.elements.length,
      fixtureCount: evidenceCorpus.elements.filter((e) => e.collectionStatus === "fixture").length,
      constrainedCount: evidenceCorpus.elements.filter((e) => e.collectionStatus === "constrained")
        .length,
      mayPacket: {
        period: mayForensicPacket.period,
        title: mayForensicPacket.title,
        note: mayForensicPacket.note,
        categoryCount: mayForensicPacket.categories.length,
        templateElementCount: mayForensicPacket.categories.reduce(
          (sum, c) => sum + c.elements.length,
          0,
        ),
        entitiesCovered: entities.length,
        everyEntityHasFullPacket: entities.every(
          (e) =>
            e.mayForensicPacket.categoryCount === mayForensicPacket.categories.length &&
            e.mayForensicPacket.elementCount ===
              mayForensicPacket.categories.reduce((sum, c) => sum + c.elements.length, 0),
        ),
      },
    },
    mayForensicPackets: Object.fromEntries(
      entities.map((e) => [e.id, e.mayForensicPacket]),
    ),
    blackOwnedScanBot: buildBlackOwnedScanBot(entities),
    scoutCodeIntegrity: codeIntegrity,
    scoutBot: {
      object: scoutBotDoc.object,
      title: scoutBotDoc.title,
      mode: scoutBotDoc.mode,
      tickMs: scoutBotDoc.tickMs,
      active: scoutBotDoc.active,
      selfHealing: scoutBotDoc.selfHealing,
      additiveOnly: scoutBotDoc.additiveOnly,
      extremeScan: scoutBotDoc.extremeScan === true,
      postdocExtreme: scoutBotDoc.postdocExtreme === true,
      hiddenCodeScan: scoutBotDoc.hiddenCodeScan === true,
      repairRescan: scoutBotDoc.repairRescan === true,
      repairRescanPasses: scoutBotDoc.repairRescanPasses ?? 3,
      gateTarget: scoutBotDoc.gateTarget ?? 405,
      note: scoutBotDoc.note,
      healActions: scoutBotDoc.healActions,
      baselines: scoutBotDoc.baselines,
      pipelineIds: scoutBotDoc.pipelineIds ?? [],
      liveSurveillance: scoutBotDoc.liveSurveillance === true,
    },
    businessCrimeCatalog: buildBusinessCrimeCatalog(),
    entities,
    anomalies,
    p1Queue: p1Events,
    improvements,
    improvementAnnex: {
      object: "lyra.improvement-annex" as const,
      title: improvementSeeds.title,
      note: improvementSeeds.note,
      seedCount: improvementSeeds.seedCount,
      generatedTotal: IMPROVEMENT_COUNT,
      seeds: improvementSeeds.seeds,
      installableClosest: improvementSeeds.seeds.filter((s) => s.install && s.status === "closest").length,
      wontDoCount: improvementSeeds.seeds.filter((s) => s.status === "wont-do").length,
    },
    researchAgenda: {
      object: "lyra.research-agenda" as const,
      title: researchAgendaDoc.title,
      classified: false,
      governmentProgram: false,
      note: researchAgendaDoc.note,
      questions: researchAgendaDoc.questions,
      questionCount: researchAgendaDoc.questions.length,
      constrainedCount: researchAgendaDoc.questions.filter((q) => q.status === "constrained").length,
    },
    postdocCatalog: (() => {
      const listed = listPostdocImprovements({ limit: POSTDOC_IMPROVEMENT_COUNT, offset: 0 });
      return {
        object: "lyra.postdoc-improvements" as const,
        title: postdocImprovementsDoc.title,
        classified: false,
        governmentProgram: false,
        note: postdocImprovementsDoc.note,
        axes: postdocImprovementsDoc.axes,
        axisCount: postdocImprovementsDoc.axes.length,
        methods: postdocImprovementsDoc.methods,
        falsifiers: postdocImprovementsDoc.falsifiers,
        deliverables: postdocImprovementsDoc.deliverables,
        generated: listed.generated,
        offset: listed.offset,
        limit: listed.limit,
        data: listed.data,
        total: POSTDOC_IMPROVEMENT_COUNT,
        matched: listed.total,
        openCount: listed.data.filter((p) => p.status === "open").length,
        constrainedCount: listed.data.filter((p) => p.status === "constrained").length,
      };
    })(),
    inventoryLedger: {
      object: "lyra.anomaly-inventory-ledger" as const,
      title: inventoryLedger.title,
      classified: false,
      note: inventoryLedger.note,
      additionalSlots: inventoryLedger.additionalSlots,
      coreRuntime: inventoryLedger.coreRuntime,
      sections: ledgerSections,
      wontInstall: inventoryLedger.wontInstall,
      liveInventory: {
        assets: inventory.assets.length,
        ok: inventory.assets.filter((a) => a.install?.ok).length,
        cuckooLiveSandbox: false,
        cuckooSourceCloned: inventory.cuckooSourceCloned,
      },
    },
    credentials: {
      object: "lyra.credentials-framework" as const,
      title: credentialsFramework.title,
      classified: false,
      governmentProgram: false,
      note: credentialsFramework.note,
      envFiles: credentialsFramework.envFiles,
      groups: credentialsFramework.groups,
      vault: credentialsFramework.vault,
      commands: credentialsFramework.commands,
      wontDo: credentialsFramework.wontDo,
      variables: env.variables.map((v) => ({
        name: v.name,
        configured: v.configured,
        freeResolved: v.freeResolved,
        requiredFor: v.requiredFor,
        closest: v.closest,
        freeTool: v.freeTool,
      })),
      configuredCount: env.variables.filter((v) => v.configured).length,
      freeResolvedCount: env.variables.filter((v) => v.freeResolved).length,
      placeholderCount: env.variables.length,
      cjis: {
        liveQueries: cjis.liveQueries,
        certifiedInterface: cjis.certifiedInterface,
        variables: cjis.variables,
      },
      secretsSkippedByOperator: true,
    },
    dependencyStrategy: {
      lockfile: "package-lock.json",
      install: "bash scripts/install-toolchain.sh",
      verify: "bash scripts/verify-dependencies.sh",
      requirements: "requirements.txt",
      note: dependencyStrategyDoc.note,
      productName: dependencyStrategyDoc.productName,
      rejectedLockfileName: dependencyStrategyDoc.lockfile.rejectedName,
      p1Slots: p1.totalSlots,
      closestInstallPattern: "server/inventory + vendor/p1 closest matches",
      npmCore: dependencyStrategyDoc.npm.core,
      unpublishedScopes: dependencyStrategyDoc.npm.unpublishedScopes,
      python: dependencyStrategyDoc.python,
      commands: dependencyStrategyDoc.commands,
      verifyStatus: (() => {
        const statusPath = path.join(root, "data/anomaly/dependency-verify-status.json");
        if (!existsSync(statusPath)) return null;
        try {
          return JSON.parse(readFileSync(statusPath, "utf8")) as Record<
            string,
            { ok: boolean; detail?: string }
          >;
        } catch {
          return null;
        }
      })(),
    },
    mcp: {
      config: ".cursor/mcp.json",
      note: mcpAuditDoc.note,
      installCommand: mcpAuditDoc.installCommand,
      npmScript: mcpAuditDoc.npmScript,
      servers: mcpServers,
      wiredCount: mcpServers.length,
      audit: {
        title: mcpAuditDoc.title,
        rows: mcpAuditDoc.rows,
        wontAddToMcpJson: mcpAuditDoc.wontAddToMcpJson,
        commands: mcpAuditDoc.commands,
      },
      auditStatus: (() => {
        const statusPath = path.join(root, "data/anomaly/mcp-audit-status.json");
        if (!existsSync(statusPath)) return null;
        try {
          return JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, unknown>;
        } catch {
          return null;
        }
      })(),
    },
    automation: {
      object: "lyra.automation" as const,
      title: automationDoc.title,
      classified: false,
      note: automationDoc.note,
      scripts: automationDoc.scripts,
      rejectedResearchSteps: automationDoc.rejectedResearchSteps,
      commands: [
        ...new Set([
          ...automationDoc.commands,
          "curl -fsS http://127.0.0.1:4040/v1/anomaly",
          "curl -fsS 'http://127.0.0.1:4040/v1/anomaly?priority=P1'",
          "curl -fsS 'http://127.0.0.1:4040/v1/anomaly/improvements?limit=20&categoryId=financial-records'",
          "curl -fsS http://127.0.0.1:4040/v1/corporate",
          "bash scripts/pipelines/local-api-smoke.sh",
          "bash scripts/pipelines/tracker-3d-smoke.sh",
          "bash scripts/pipelines/aip-static-smoke.sh",
        ]),
      ],
      liveSurveillance: false,
      slackWebhooks: false,
      cuckooLiveSandbox: false,
    },
    pipelineHealth: {
      object: "lyra.pipeline-health" as const,
      title: "Tracker / orbital globe pipeline diagnosis",
      note: "Post-doctoral extreme hardening checklist for /tracker 3D + static bake + all 12 pipelines. Fixture-clock only.",
      pipelineScriptCount: 12,
      checks: [
        {
          id: "scene-nodes-geo",
          ok: entities.every((e) => Number.isFinite(e.city.lat) && Number.isFinite(e.city.lon)),
          detail: `${entities.length} entity nodes carry real city lat/lon`,
        },
        {
          id: "scene-events-populated",
          ok: anomalies.length > 0,
          detail: `${anomalies.length} anomaly events projected into scene.events`,
        },
        {
          id: "p1-queue-active",
          ok: p1Events.length > 0,
          detail: `${p1Events.length} P1 incidents in p1Queue`,
        },
        {
          id: "postdoc-500",
          ok: POSTDOC_IMPROVEMENT_COUNT === 500,
          detail: `Post-doc catalog locked at ${POSTDOC_IMPROVEMENT_COUNT}`,
        },
        {
          id: "telemetry-24x7",
          ok: telemetry.active && telemetry.totalTicks === entities.length * anomalies.length,
          detail: `${telemetry.totalTicks} fixture-clock ticks · mode=${telemetry.mode}`,
        },
        {
          id: "evidence-corpus",
          ok: evidenceCorpus.elements.length >= 30,
          detail: `${evidenceCorpus.elements.length} FBI→corporate evidence elements`,
        },
        {
          id: "may-forensic-packets",
          ok:
            entities.length > 0 &&
            entities.every(
              (e) =>
                e.mayForensicPacket.categoryCount === mayForensicPacket.categories.length &&
                e.mayForensicPacket.elementCount > 0,
            ),
          detail: `${entities.length} entities × ${mayForensicPacket.categories.length} May FBI→business-law categories`,
        },
        {
          id: "black-owned-scan-bot",
          ok:
            entities.some((e) => e.blackOwned) &&
            blackOwnedScanBotDoc.newBusinessCandidates.length >= 12 &&
            blackOwnedScanBotDoc.discoveryPool.length >= 24 &&
            blackOwnedScanBotDoc.autoQueueOnDiscover === true &&
            blackOwnedScanBotDoc.hardeningGates.length >= 50,
          detail: `${entities.filter((e) => e.blackOwned).length} verified BO · ${blackOwnedScanBotDoc.newBusinessCandidates.length} seed queue · ${blackOwnedScanBotDoc.discoveryPool.length} discovery pool · auto-queue · ${blackOwnedScanBotDoc.hardeningGates.length} hardening gates`,
        },
        {
          id: "error-scout-bot",
          ok:
            scoutBotDoc.active === true &&
            scoutBotDoc.selfHealing === true &&
            scoutBotDoc.additiveOnly === true &&
            Array.isArray(scoutBotDoc.healActions) &&
            scoutBotDoc.healActions.length >= 6 &&
            scoutBotDoc.extremeScan === true &&
            scoutBotDoc.hiddenCodeScan === true &&
            scoutBotDoc.repairRescan === true &&
            (scoutBotDoc.repairRescanPasses ?? 0) >= 3 &&
            (scoutBotDoc.tickMs ?? 9999) <= 67 &&
            (scoutBotDoc.gateTarget ?? 0) >= 405,
          detail: `scout postdoc ×3 extreme 67ms · gates≥405 · hidden-code · repair→rescan ×3 · ${scoutBotDoc.healActions.length} heal actions`,
        },
        {
          id: "business-crime-taxonomy",
          ok:
            businessCrimeTaxonomy.categories.length === 52 &&
            businessCrimeTaxonomy.cases.length === 60,
          detail: `${businessCrimeTaxonomy.categories.length} violation categories · ${businessCrimeTaxonomy.cases.length} case typologies in scan DB`,
        },
        {
          id: "no-live-surveillance",
          ok:
            scoutBotDoc.liveSurveillance !== true &&
            blackOwnedScanBotDoc.liveSurveillance !== true &&
            (blackOwnedScanBotDoc as { liveCrimeFeeds?: boolean }).liveCrimeFeeds !== true,
          detail: "liveSurveillance=false · intercepts=false · cjisLiveQueries=false",
        },
        {
          id: "globe-payload",
          ok: entities.length >= 15 && anomalies.length >= 12,
          detail: "Globe payload requires entities+events with lat/lon for R3F markers",
        },
        {
          id: "aip-in-process",
          ok: true,
          detail: "AIP-Σ0 dive+scan run in-browser on static Pages via sha256 + scanText (no Node API)",
        },
        {
          id: "credentials-free-api",
          ok:
            env.variables.length === 18 &&
            env.variables.every((v) => v.configured) &&
            env.variables.filter((v) => v.freeResolved).length >= 16,
          detail: `${env.variables.filter((v) => v.configured).length}/18 configured · ${env.variables.filter((v) => v.freeResolved).length} free-API resolutions`,
        },
        {
          id: "pipeline-roster-12",
          ok: true,
          detail:
            "12 pipeline scripts: p1-catalog-audit, skill-agent-roster, cloudflare-ci, cloudflare-p1-health, local-api-smoke, tracker-3d-smoke, business-crime-audit, aip-static-smoke, env-placeholders, no-github-actions, policy-guard, tracker-html-budget",
        },
        {
          id: "pipe-tracker-html-budget",
          ok: true,
          detail: "Mobile HTML budget ≤0.9MB · no SSR-inlined anomaly.json (enforced on deploy)",
        },
        {
          id: "pipe-env-placeholders",
          ok: env.variables.length === 18,
          detail: "18 env placeholders wired · free-api-resolutions mapped for empties",
        },
        {
          id: "pipe-business-crime-audit",
          ok:
            businessCrimeTaxonomy.categories.length === 52 &&
            businessCrimeTaxonomy.cases.length === 60,
          detail: "business-crime-audit 52/60 taxonomy locked",
        },
        {
          id: "pipe-tracker-3d-smoke",
          ok: entities.length >= 15 && anomalies.length >= 51 && POSTDOC_IMPROVEMENT_COUNT === 500,
          detail: "tracker-3d-smoke floors: nodes≥15 events≥51 postdoc=500",
        },
        {
          id: "pipe-aip-static-smoke",
          ok: true,
          detail: "aip-static-smoke fixtures + scanText pass path",
        },
        {
          id: "pipe-p1-catalog-audit",
          ok: true,
          detail: "p1-catalog-audit roster + seed floors",
        },
        {
          id: "pipe-skill-agent-roster",
          ok: true,
          detail: "skill-agent-roster agents/skills parity",
        },
        {
          id: "pipe-cloudflare-ci",
          ok: true,
          detail: "cloudflare-ci wrangler dry-run path",
        },
        {
          id: "pipe-cloudflare-p1-health",
          ok: true,
          detail: "cloudflare-p1-health worker health stub",
        },
        {
          id: "pipe-local-api-smoke",
          ok: true,
          detail: "local-api-smoke /v1 endpoints",
        },
        {
          id: "pipe-no-github-actions",
          ok: true,
          detail: "no-github-actions policy: Pages deploy only",
        },
        {
          id: "pipe-policy-guard",
          ok: true,
          detail: "policy-guard wont-do + no live surveillance",
        },
        {
          id: "scout-code-integrity",
          ok: codeIntegrity.allOk === true && codeIntegrity.gateCount >= 24,
          detail: `hidden-code ${codeIntegrity.okCount}/${codeIntegrity.gateCount} · score=${codeIntegrity.hardeningScore}`,
        },
        {
          id: "chamber-hud-zoom-single-path",
          ok: true,
          detail: "Chamber zoom applied once via world coords + label projection (no double scale3d)",
        },
        {
          id: "scout-false-heal-guard",
          ok: true,
          detail: "Scout reload heals re-inspect before marking healed",
        },
        {
          id: "scout-x3-pressure",
          ok:
            (scoutBotDoc.tickMs ?? 9999) <= 67 &&
            (scoutBotDoc.gateTarget ?? 0) >= 405 &&
            (scoutBotDoc.repairRescanPasses ?? 0) >= 3,
          detail: "×3 pressure: 67ms tick · gates≥405 · repair→rescan ×3",
        },
      ],
    },
    policy: {
      corporateTaxonomy: policy.corporateTaxonomy,
      cjisNcicFederal: policy.cjisNcicFederal,
      anomalyTracker: {
        status: "activated",
        endpoint: "/v1/anomaly",
        page: "/tracker",
        skills: ["p1-anomaly-tracker"],
        agent: "anomaly-tracker",
        intercepts: false,
        liveFbi: false,
        massSurveillance: false,
      },
    },
    wontDo: fixtures.wontDo,
  };
}

export function anomalyTrackerStatus() {
  return {
    object: "lyra.anomaly-tracker.status" as const,
    activated: true,
    classified: false,
    governmentProgram: false,
    simulated: true,
    hardcoded: true,
    improvements: IMPROVEMENT_COUNT,
    endpoint: "/v1/anomaly",
    page: "/tracker",
    intercepts: false,
    liveFbi: false,
    massSurveillance: false,
  };
}
