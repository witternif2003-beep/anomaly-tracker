import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import manifest from "../data/p1/one-shot-manifest.json";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = path.join(root, "data/p1/one-shot-status.json");

function dockerAvailable(): boolean {
  if (existsSync("/var/run/docker.sock") || existsSync("/run/docker.sock")) return true;
  try {
    execFileSync("docker", ["info"], { stdio: "ignore", timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

export function oneShotStatus() {
  let installed: Record<string, { ok: boolean; requested?: string; installed?: string; detail?: string }> = {};
  if (existsSync(statusPath)) {
    try {
      installed = JSON.parse(readFileSync(statusPath, "utf8")) as typeof installed;
    } catch {
      installed = {};
    }
  }
  const steps = manifest.steps.map((step) => ({
    ...step,
    result: installed[step.id] ?? {
      ok: false,
      detail: "run bash scripts/install-one-shot.sh",
    },
  }));
  const okCount = steps.filter((s) => s.result.ok).length;
  return {
    object: "install.one-shot" as const,
    script: manifest.script,
    dockerAvailable: dockerAvailable(),
    cuckooLiveSandbox: false,
    cuckooSourceCloned: existsSync(path.join(root, "vendor/p1/cuckoo/.git")),
    reconNgCloned: existsSync(path.join(root, "vendor/p1/recon-ng/.git")),
    okCount,
    stepCount: steps.length,
    note: manifest.note,
    steps,
  };
}
