import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fixtures from "../data/anomaly/fixtures.json";
import inventoryLedger from "../data/anomaly/inventory-ledger.json";
import dependencyStrategyDoc from "../data/anomaly/dependency-strategy.json";
import mcpAuditDoc from "../data/anomaly/mcp-audit.json";
import credentialsFramework from "../data/anomaly/credentials-framework.json";
import automationDoc from "../data/anomaly/automation.json";
import taxonomy from "../data/legal/corporate-taxonomy.json";
import { listP1Slots } from "./p1-catalog";
import { inventoryStatus } from "./inventory";
import { envPlaceholderStatus } from "./load-env";
import { oneShotStatus } from "./install-status";
import { cjisStatus, policyStatus } from "./policy";

const IMPROVEMENT_COUNT = 10080;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
};

function buildImprovement(index: number): AnomalyImprovement {
  const categories = taxonomy.categories;
  const category = categories[index % categories.length];
  const entityType = fixtures.entityTypes[index % fixtures.entityTypes.length];
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

function enrichEntity(entity: FixtureEntity, index: number) {
  const city = cityById(entity.cityId);
  const type = entityTypeById(entity.entityType);
  const related = fixtures.anomalies.filter((a) => a.entityId === entity.id);
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
    position: project3d(city.lat, city.lon, topPriority === "ok" ? "P3" : topPriority, index),
  };
}

function enrichAnomaly(anomaly: FixtureAnomaly, index: number) {
  const entity = fixtures.entities.find((e) => e.id === anomaly.entityId);
  if (!entity) throw new Error(`Unknown entity ${anomaly.entityId}`);
  const city = cityById(entity.cityId);
  return {
    ...anomaly,
    categoryLabel: categoryLabel(anomaly.categoryId),
    entityName: entity.name,
    entityType: entity.entityType,
    entityTypeLabel: entityTypeById(entity.entityType).label,
    city,
    position: project3d(city.lat, city.lon, anomaly.priority, index),
    classified: false,
    liveFbiFeed: false,
    intercept: false,
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
  const p1 = listP1Slots({ limit: 1, offset: 0 });
  const improvements = listImprovements({
    q: opts?.q,
    categoryId: opts?.categoryId,
    priority: opts?.priority,
    limit: opts?.improvementLimit ?? 48,
    offset: opts?.improvementOffset ?? 0,
  });

  const entities = fixtures.entities.map((e, i) => enrichEntity(e, i));
  const anomalies = fixtures.anomalies.map((a, i) => enrichAnomaly(a, i));
  const p1Events = anomalies.filter((a) => a.priority === "P1");

  const byCategory: Record<string, number> = {};
  for (const a of anomalies) {
    byCategory[a.categoryId] = (byCategory[a.categoryId] ?? 0) + 1;
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
      improvements: IMPROVEMENT_COUNT,
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
      intercepts: false,
      cjisLiveQueries: false,
      cuckooLiveSandbox: false,
    },
    priorityCounts,
    byCategory,
    scene: {
      kind: "css-perspective-3d",
      realtime: "fixture-clock",
      nodes: entities.map((e) => ({
        id: e.id,
        label: e.name,
        entityType: e.entityType,
        priority: e.topPriority,
        position: e.position,
        city: e.city.label,
        anomalyCount: e.anomalyCount,
      })),
      events: anomalies.map((a) => ({
        id: a.id,
        entityId: a.entityId,
        priority: a.priority,
        title: a.title,
        position: a.position,
        categoryId: a.categoryId,
      })),
    },
    entities,
    anomalies,
    p1Queue: p1Events,
    improvements,
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
        requiredFor: v.requiredFor,
        closest: v.closest,
      })),
      configuredCount: env.variables.filter((v) => v.configured).length,
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
        ...automationDoc.commands,
        "curl -fsS http://127.0.0.1:4040/v1/anomaly",
        "curl -fsS 'http://127.0.0.1:4040/v1/anomaly?priority=P1'",
        "curl -fsS 'http://127.0.0.1:4040/v1/anomaly/improvements?limit=20&categoryId=financial-records'",
        "curl -fsS http://127.0.0.1:4040/v1/corporate",
        "bash scripts/pipelines/local-api-smoke.sh",
      ],
      liveSurveillance: false,
      slackWebhooks: false,
      cuckooLiveSandbox: false,
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
