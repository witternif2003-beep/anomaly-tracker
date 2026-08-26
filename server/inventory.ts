import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "../data/p1/inventory-manifest.json";
import { TIER1_ADDITIONAL_SLOTS } from "./p1-tier1";
import { oneShotStatus } from "./install-status";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const statusPath = path.join(root, "data/p1/inventory-status.json");

export function inventoryStatus() {
  let installed: Record<string, { ok: boolean; detail?: string }> = {};
  if (existsSync(statusPath)) {
    try {
      installed = JSON.parse(readFileSync(statusPath, "utf8")) as typeof installed;
    } catch {
      installed = {};
    }
  }
  return {
    object: "p1.inventory" as const,
    additionalSlots: TIER1_ADDITIONAL_SLOTS,
    dockerAvailable: oneShotStatus().dockerAvailable,
    cuckooLiveSandbox: false,
    cuckooSourceCloned: existsSync(path.join(root, "vendor/p1/cuckoo/.git")),
    assets: manifest.assets.map((asset) => ({
      ...asset,
      install: installed[asset.id] ?? { ok: false, detail: "run bash scripts/install-p1-inventory.sh" },
    })),
  };
}
