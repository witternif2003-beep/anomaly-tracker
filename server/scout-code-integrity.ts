/**
 * Postdoc hidden-code integrity audit (additive).
 * Runs at static bake time — scout validates the embedded report.
 * Never removes features; only reports / requires heals via reload-static.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export type CodeIntegrityGate = {
  id: string;
  group: string;
  ok: boolean;
  detail: string;
};

function walk(dir: string, acc: string[] = [], depth = 0): string[] {
  if (depth > 6 || !existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "out" || name === ".next" || name === "vendor") {
      continue;
    }
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc, depth + 1);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(name)) acc.push(full);
  }
  return acc;
}

function read(rel: string): string {
  const full = path.join(ROOT, rel);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

function fileHas(rel: string, needle: RegExp | string): boolean {
  const text = read(rel);
  return typeof needle === "string" ? text.includes(needle) : needle.test(text);
}

/** Scan checkout for known latent faults the scout must keep green. */
export function compileScoutCodeIntegrity() {
  const gates: CodeIntegrityGate[] = [];

  const push = (id: string, group: string, ok: boolean, detail: string) => {
    gates.push({ id, group, ok, detail });
  };

  // React #440 class: no live useEffectEvent call sites in app components
  const srcFiles = walk(path.join(ROOT, "src"));
  let effectEventCalls = 0;
  for (const file of srcFiles) {
    const text = readFileSync(file, "utf8");
    // Import or call of useEffectEvent (excluding comments about #440)
    const lines = text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const blob = lines.join("\n");
    if (/\buseEffectEvent\s*\(/.test(blob) || /from ["']react["'].*useEffectEvent|useEffectEvent[^"'\n]*from ["']react["']/.test(blob)) {
      // count actual hook usage
      if (/\buseEffectEvent\s*\(/.test(blob)) effectEventCalls += 1;
    }
  }
  push(
    "hidden-no-useEffectEvent",
    "react",
    effectEventCalls === 0,
    effectEventCalls === 0
      ? "No useEffectEvent call sites in src (React #440 class cleared)"
      : `${effectEventCalls} useEffectEvent call site(s) remain`,
  );

  // Empty Content-Type must be accepted for Pages static JSON
  push(
    "hidden-static-json-empty-ctype",
    "fetch",
    fileHas("src/lib/static-data.ts", "if (!type) return true"),
    "static-data looksLikeJson treats empty Content-Type as OK",
  );
  push(
    "hidden-globe-no-ctype-throw",
    "fetch",
    !fileHas("src/components/3d/BusinessGlobe.tsx", 'throw new Error("not-json")'),
    "BusinessGlobe does not throw on missing Content-Type",
  );
  push(
    "hidden-aip-empty-ctype",
    "fetch",
    fileHas("src/components/lyra/aip-console.tsx", "if (!type) return true") ||
      fileHas("src/components/lyra/aip-console.tsx", '!type) return true'),
    "AipConsole JSON detect allows empty Content-Type",
  );

  // Chamber zoom single path (no CSS scale3d(zoom))
  push(
    "hidden-chamber-no-double-zoom",
    "chamber",
    !fileHas("src/components/3d/orbital-chamber.tsx", "scale3d(${zoom}"),
    "orbital-chamber does not CSS scale3d(zoom) (single zoom path)",
  );

  // Scout false-heal guard present
  push(
    "hidden-scout-false-heal-guard",
    "scout",
    fileHas("src/lib/scout-healer.ts", "afterReload") &&
      fileHas("src/lib/scout-healer.ts", "only mark reload heals"),
    "scout-healer re-inspects after reload before marking healed",
  );

  // BO admit idempotency via admittedKeysRef
  push(
    "hidden-bo-admit-keys",
    "bo-scan",
    fileHas("src/components/lyra/black-owned-scan-bot.tsx", "admittedKeysRef"),
    "BO scan uses admittedKeysRef to avoid duplicate auto-queue logs",
  );

  // Heal boundary backs off on #440
  push(
    "hidden-heal-boundary-440-backoff",
    "scout",
    fileHas("src/components/lyra/tracker-heal-boundary.tsx", "#440"),
    "TrackerHealBoundary backs off on React #440",
  );

  // Tracker page must not SSR-inline anomaly.json
  const trackerPage = read("src/app/tracker/page.tsx");
  push(
    "hidden-tracker-no-ssr-inline",
    "mobile",
    !/readFileSync[\s\S]*anomaly\.json|import\s+anomaly\s+from/.test(trackerPage),
    "tracker page does not SSR-inline anomaly.json",
  );

  // Free-API resolutions file present for all non-CF placeholders
  const freeDoc = read("data/anomaly/free-api-resolutions.json");
  let freeOk = false;
  try {
    const parsed = JSON.parse(freeDoc) as { resolutions?: Record<string, unknown> };
    freeOk = Object.keys(parsed.resolutions ?? {}).length >= 16;
  } catch {
    freeOk = false;
  }
  push("hidden-free-api-map-16", "credentials", freeOk, "free-api-resolutions.json maps ≥16 placeholders");

  // All 12 pipeline scripts exist
  const pipes = [
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
  ];
  const missingPipes = pipes.filter((p) => !existsSync(path.join(ROOT, "scripts/pipelines", `${p}.sh`)));
  push(
    "hidden-pipeline-scripts-12",
    "pipeline",
    missingPipes.length === 0,
    missingPipes.length === 0 ? "All 12 pipeline scripts present" : `missing=${missingPipes.join(",")}`,
  );

  // Scout extreme tick pressure ≤200ms in config source of truth
  const scoutJson = read("data/anomaly/scout-bot.json");
  let tickOk = false;
  let gateOk = false;
  try {
    const s = JSON.parse(scoutJson) as { tickMs?: number; gateTarget?: number; extremeScan?: boolean };
    tickOk = (s.tickMs ?? 9999) <= 200;
    gateOk = (s.gateTarget ?? 0) >= 135 && s.extremeScan === true;
  } catch {
    tickOk = false;
  }
  push("hidden-scout-tick-200", "scout", tickOk, "scout-bot.json tickMs ≤200 (3× harder than 600)");
  push("hidden-scout-gates-135", "scout", gateOk, "scout-bot.json gateTarget ≥135 + extremeScan");

  const okCount = gates.filter((g) => g.ok).length;
  return {
    object: "lyra.scout-code-integrity" as const,
    title: "Postdoc hidden-code integrity audit",
    classified: false,
    note: "Bake-time scan of latent client/server anti-patterns. Scout deep-dives this report every tick. Additive only.",
    gateCount: gates.length,
    okCount,
    allOk: okCount === gates.length,
    hardeningScore: gates.length ? Math.round((okCount / gates.length) * 100) : 0,
    gates,
    generatedAt: new Date().toISOString(),
  };
}
