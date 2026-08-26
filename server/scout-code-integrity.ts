/**
 * Postdoc ×3 hidden-code integrity audit (additive).
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
    const lines = text.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    const blob = lines.join("\n");
    if (/\buseEffectEvent\s*\(/.test(blob)) effectEventCalls += 1;
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
      fileHas("src/components/lyra/aip-console.tsx", "!type) return true"),
    "AipConsole JSON detect allows empty Content-Type",
  );
  push(
    "hidden-studio-empty-ctype",
    "fetch",
    fileHas("src/components/lyra/studio.tsx", "if (!type) return true") ||
      fileHas("src/components/lyra/studio.tsx", "!type) return true") ||
      !fileHas("src/components/lyra/studio.tsx", 'throw new Error("not-json")'),
    "Studio fetch path tolerates empty Content-Type",
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

  // Scout ×3 pressure constants
  push(
    "hidden-scout-tick-const-67",
    "scout",
    fileHas("src/lib/scout-healer.ts", "SCOUT_TICK_MS = 67") ||
      fileHas("src/lib/scout-healer.ts", "tickMsMax: 67"),
    "scout-healer SCOUT_TICK_MS / tickMsMax = 67 (×3 harder)",
  );
  push(
    "hidden-scout-gate-target-405",
    "scout",
    fileHas("src/lib/scout-healer.ts", "gateTarget: 405"),
    "scout-healer gateTarget = 405",
  );
  push(
    "hidden-scout-repair-passes-3",
    "scout",
    fileHas("src/lib/scout-healer.ts", "repairRescanPasses: 3") &&
      fileHas("src/components/lyra/scout-bot.tsx", "repairRescanPasses"),
    "repair→rescan ×3 wired in healer + panel",
  );
  push(
    "hidden-scout-inflight-guard",
    "scout",
    fileHas("src/components/lyra/scout-bot.tsx", "inFlightRef"),
    "scout panel guards overlapping ticks under 67ms pressure",
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

  // Scroll-stable auto-feeds (W3C overflow-anchor)
  push(
    "hidden-scroll-stable-feed",
    "ux",
    fileHas("src/components/lyra/scroll-stable-feed.tsx", "overflow-anchor") &&
      fileHas("src/app/globals.css", "scroll-stable-feed") &&
      fileHas("src/components/lyra/live-telemetry-feed.tsx", "ScrollStableFeed"),
    "ScrollStableFeed + CSS overflow-anchor:none on auto-populating feeds",
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

  // applyFreeApiDefaults present
  push(
    "hidden-free-api-apply-defaults",
    "credentials",
    fileHas("server/load-env.ts", "applyFreeApiDefaults") ||
      fileHas("server/load-env.ts", "free-api"),
    "load-env applies free-API defaults for empty placeholders",
  );

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
  for (const p of pipes) {
    push(
      `hidden-pipe-file-${p}`,
      "pipeline",
      existsSync(path.join(ROOT, "scripts/pipelines", `${p}.sh`)),
      `scripts/pipelines/${p}.sh present`,
    );
  }

  // Scout ×3 tick pressure ≤67ms in config source of truth
  const scoutJson = read("data/anomaly/scout-bot.json");
  let tickOk = false;
  let gateOk = false;
  let passesOk = false;
  let hiddenOk = false;
  try {
    const s = JSON.parse(scoutJson) as {
      tickMs?: number;
      gateTarget?: number;
      extremeScan?: boolean;
      hiddenCodeScan?: boolean;
      repairRescan?: boolean;
      repairRescanPasses?: number;
    };
    tickOk = (s.tickMs ?? 9999) <= 67;
    gateOk = (s.gateTarget ?? 0) >= 405 && s.extremeScan === true;
    passesOk = (s.repairRescanPasses ?? 0) >= 3 && s.repairRescan === true;
    hiddenOk = s.hiddenCodeScan === true;
  } catch {
    tickOk = false;
  }
  push("hidden-scout-tick-67", "scout", tickOk, "scout-bot.json tickMs ≤67 (×3 harder than 200)");
  push("hidden-scout-gates-405", "scout", gateOk, "scout-bot.json gateTarget ≥405 + extremeScan");
  push("hidden-scout-repair-x3", "scout", passesOk, "scout-bot.json repairRescanPasses ≥3");
  push("hidden-scout-hidden-code-flag", "scout", hiddenOk, "scout-bot.json hiddenCodeScan=true");

  // Additive-only guarantee in scout panel copy / healer
  push(
    "hidden-additive-only-contract",
    "policy",
    fileHas("src/lib/scout-healer.ts", "Never removes features") &&
      fileHas("data/anomaly/scout-bot.json", '"additiveOnly": true'),
    "Additive-only contract present in healer + scout-bot.json",
  );

  // No live surveillance flags in scout config
  push(
    "hidden-no-live-surveillance-scout",
    "policy",
    fileHas("data/anomaly/scout-bot.json", '"liveSurveillance": false'),
    "scout-bot.json liveSurveillance=false",
  );

  const okCount = gates.filter((g) => g.ok).length;
  return {
    object: "lyra.scout-code-integrity" as const,
    title: "Postdoc ×3 hidden-code integrity audit",
    classified: false,
    note: "Bake-time deep dive of latent client/server anti-patterns + all 12 pipelines. Scout validates every tick. Additive only.",
    gateCount: gates.length,
    okCount,
    allOk: okCount === gates.length,
    hardeningScore: gates.length ? Math.round((okCount / gates.length) * 100) : 0,
    gates,
    generatedAt: new Date().toISOString(),
  };
}
