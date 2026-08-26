import type { P1Slot } from "./p1-types";
import { mapP1Entities } from "./p1-entities";
import manifest from "../data/p1/inventory-manifest.json";

export type InventoryAsset = (typeof manifest.assets)[number];

export const TIER1_ADDITIONAL_SLOTS = manifest.additionalSlots;
export const TIER1_ASSETS: InventoryAsset[] = manifest.assets;

export function buildTier1Slot(index: number): P1Slot {
  const slot = index + 1;
  const asset = TIER1_ASSETS[index % TIER1_ASSETS.length];
  const mapped = mapP1Entities(index);
  const id = `p1-t1-${String(slot).padStart(5, "0")}`;
  return {
    id,
    slot: 1280 + slot,
    title: `T1 ${asset.family}: ${asset.requested} → ${asset.closest}`,
    practiceArea: asset.family,
    jurisdiction: "inventory",
    workProduct: asset.kind,
    folioTopic: asset.requested,
    courtlistenerQuery: asset.closest,
    status: "available",
    tags: ["p1", "tier-1", asset.family, asset.kind, asset.id, mapped.skillId],
    tier: "tier-1",
    assetFamily: asset.family,
    requestedPackage: asset.requested,
    installedPackage: asset.closest,
    ...mapped,
  };
}

export const TIER1_CATALOG: P1Slot[] = Array.from({ length: TIER1_ADDITIONAL_SLOTS }, (_, i) => buildTier1Slot(i));
