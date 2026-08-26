import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import taxonomy from "../data/legal/corporate-taxonomy.json";
import { envPlaceholderStatus } from "./load-env";
import { inventoryStatus } from "./inventory";
import { oneShotStatus } from "./install-status";
import { cjisStatus } from "./policy";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

type BindingState = "present" | "missing" | "placeholder" | "wont-do" | "closest";

export interface Binding {
  kind: "file" | "lockfile" | "module" | "mcp" | "credential" | "inventory" | "command";
  id: string;
  state: BindingState;
  detail: string;
}

interface CategorySpec {
  id: string;
  label: string;
  application: string;
  doctrine: string[];
  corporateUse: string;
  files: string[];
  lockfilePackages: string[];
  mcp: string[];
  credentials: string[];
  inventory: string[];
  commands: string[];
}

function readLockPackages(): Set<string> {
  const lockPath = path.join(root, "package-lock.json");
  if (!existsSync(lockPath)) return new Set();
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
      packages?: Record<string, unknown>;
      dependencies?: Record<string, unknown>;
    };
    const names = new Set<string>();
    for (const key of Object.keys(lock.packages ?? {})) {
      const name = key.replace(/^node_modules\//, "");
      if (name && !name.includes("/node_modules/")) names.add(name.split("/")[0] === "@" ? name : name);
      if (name) names.add(name);
    }
    for (const name of Object.keys(lock.dependencies ?? {})) names.add(name);
    return names;
  } catch {
    return new Set();
  }
}

function readMcpServers(): Set<string> {
  const mcpPath = path.join(root, ".cursor/mcp.json");
  if (!existsSync(mcpPath)) return new Set();
  try {
    const cfg = JSON.parse(readFileSync(mcpPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };
    return new Set(Object.keys(cfg.mcpServers ?? {}));
  } catch {
    return new Set();
  }
}

function moduleInstalled(name: string): boolean {
  return existsSync(path.join(root, "node_modules", name));
}

function bindFile(rel: string): Binding {
  const ok = existsSync(path.join(root, rel));
  return {
    kind: "file",
    id: rel,
    state: ok ? "present" : "missing",
    detail: ok ? "on disk" : "not in this checkout",
  };
}

function bindLock(name: string, locked: Set<string>): Binding {
  const inLock = locked.has(name);
  const onDisk = moduleInstalled(name);
  if (inLock) {
    return { kind: "lockfile", id: name, state: "present", detail: "named in package-lock.json" };
  }
  if (onDisk) {
    return {
      kind: "module",
      id: name,
      state: "closest",
      detail: "in node_modules but not the root lockfile (inventory extra)",
    };
  }
  return { kind: "lockfile", id: name, state: "missing", detail: "not in package-lock.json" };
}

function bindMcp(name: string, servers: Set<string>): Binding {
  return {
    kind: "mcp",
    id: name,
    state: servers.has(name) ? "present" : "missing",
    detail: servers.has(name) ? "wired in .cursor/mcp.json" : "not an MCP server here",
  };
}

function bindCredential(
  name: string,
  env: ReturnType<typeof envPlaceholderStatus>,
): Binding {
  const row = env.variables.find((v) => v.name === name);
  const set = Boolean(process.env[name]?.trim());
  if (set) {
    return { kind: "credential", id: name, state: "present", detail: "set in process env (value not printed)" };
  }
  if (row) {
    return {
      kind: "credential",
      id: name,
      state: "placeholder",
      detail: `empty placeholder · ${row.requiredFor}`,
    };
  }
  const optional = Boolean(process.env[name] !== undefined);
  return {
    kind: "credential",
    id: name,
    state: optional ? "placeholder" : "placeholder",
    detail: "listed for this category; unset (do not invent a secret)",
  };
}

function bindInventory(
  id: string,
  inventory: ReturnType<typeof inventoryStatus>,
): Binding {
  const asset = inventory.assets.find((a) => a.id === id);
  if (!asset) {
    return { kind: "inventory", id, state: "missing", detail: "not in inventory-manifest.json" };
  }
  const ok = Boolean(asset.install?.ok);
  return {
    kind: "inventory",
    id,
    state: ok ? "closest" : "missing",
    detail: `${asset.requested} → ${asset.closest}${ok ? "" : " (run inventory install)"}`,
  };
}

function bindCommand(cmd: string): Binding {
  return {
    kind: "command",
    id: cmd,
    state: "present",
    detail: "documented local command — run against this studio, not a government portal",
  };
}

export function compileCorporateTaxonomy() {
  const locked = readLockPackages();
  const mcp = readMcpServers();
  const env = envPlaceholderStatus();
  const inventory = inventoryStatus();
  const install = oneShotStatus();
  const cjis = cjisStatus();
  const categories = (taxonomy.categories as CategorySpec[]).map((cat) => {
    const bindings: Binding[] = [
      ...cat.files.map(bindFile),
      ...cat.lockfilePackages.map((name) => bindLock(name, locked)),
      ...cat.mcp.map((name) => bindMcp(name, mcp)),
      ...cat.credentials.map((name) => bindCredential(name, env)),
      ...cat.inventory.map((id) => bindInventory(id, inventory)),
      ...cat.commands.map(bindCommand),
    ];
    const present = bindings.filter((b) => b.state === "present" || b.state === "closest").length;
    return {
      ...cat,
      bindings,
      bindingCount: bindings.length,
      presentCount: present,
    };
  });

  return {
    object: "lyra.corporate-taxonomy" as const,
    title: taxonomy.title,
    audience: taxonomy.audience,
    classified: false as const,
    governmentProgram: false as const,
    simulated: false as const,
    note: taxonomy.note,
    generatedAt: new Date().toISOString(),
    commandOutput: {
      node: process.version,
      npmScriptVerify: "npm run verify",
      localApi: "curl -sS http://127.0.0.1:4040/health",
      oneShot: `${install.okCount}/${install.stepCount} steps recorded`,
      dockerAvailable: install.dockerAvailable,
      cuckooLiveSandbox: false,
      cjisLiveQueries: cjis.liveQueries,
      mcpServers: [...mcp].sort(),
      lockfileCore: ["next", "express", "react", "typescript"].filter((name) => locked.has(name)),
    },
    summary: {
      categories: categories.length,
      enforcement: taxonomy.enforcement.length,
      workflow: taxonomy.workflow.length,
      wontDo: taxonomy.wontDo.length,
      bindingsPresent: categories.reduce((n, c) => n + c.presentCount, 0),
      bindingsTotal: categories.reduce((n, c) => n + c.bindingCount, 0),
    },
    categories,
    enforcement: taxonomy.enforcement.map((row) => ({
      ...row,
      liveAction: false as const,
    })),
    workflow: taxonomy.workflow,
    wontDo: taxonomy.wontDo,
    skills: [
      { id: "p1-corporate-taxonomy", path: ".cursor/skills/p1-corporate-taxonomy/skill.yaml" },
      { id: "p1-legal-hold", path: ".cursor/skills/p1-legal-hold/skill.yaml" },
      { id: "p1-compliance-matrix", path: ".cursor/skills/p1-compliance-matrix/skill.yaml" },
    ],
    agent: { id: "corporate-counsel", path: ".cursor/agents/corporate-counsel.md" },
  };
}

export function searchCorporateTaxonomy(query: string, limit = 8) {
  const compiled = compileCorporateTaxonomy();
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const hay = (text: string) => {
    const low = text.toLowerCase();
    return terms.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
  };
  const rows = [
    ...compiled.categories.map((c) => ({
      id: c.id,
      title: c.label,
      snippet: c.application,
      score: hay(`${c.label} ${c.application} ${c.doctrine.join(" ")} ${c.corporateUse}`),
    })),
    ...compiled.enforcement.map((e) => ({
      id: e.id,
      title: e.label,
      snippet: `${e.framework} — ${e.corporateResponse}`,
      score: hay(`${e.label} ${e.framework} ${e.corporateResponse} ${e.searchQuery}`),
    })),
  ]
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return rows;
}
