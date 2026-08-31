/**
 * Deterministic regression for the continuous-discovery synthesis model.
 * Proves counters grow, rows stay unique, the store only moves up, and the
 * frozen-fixture defect (a finite replayed pool) can never come back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DISCOVERY_BACKLOG_TICK_MS,
  backlogCounters,
  discoveryIndexAt,
  discoveryStore,
  p1RatioFromSeed,
  synthesizeBusiness,
  synthesizeViolation,
  type DiscoverySeed,
} from "../src/lib/continuous-discovery";
import {
  P1_LOG_CAP,
  bakedP1Entries,
  formatP1Ref,
  p1Log,
  syntheticP1Number,
} from "../src/lib/p1-registry";

const failures: string[] = [];
const check = (ok: boolean, label: string) => {
  if (!ok) failures.push(label);
};

const bake = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/static/anomaly.json"), "utf8"),
) as {
  blackOwnedScanBot?: { discoverySynthesis?: DiscoverySeed };
  anomalies?: Array<{
    id: string;
    priority: string;
    title: string;
    entityName: string;
    categoryId?: string;
    categoryLabel: string;
    indicator?: string;
  }>;
};
const seed = bake.blackOwnedScanBot?.discoverySynthesis;
if (!seed) {
  console.error("PIPELINE FAIL continuous-discovery — no discoverySynthesis in bake");
  process.exit(1);
}

// Uniqueness far past the baked pool: 50k consecutive indices, no collisions.
const SAMPLE = 50_000;
const ids = new Set<string>();
const names = new Set<string>();
for (let i = 0; i < SAMPLE; i += 1) {
  const business = synthesizeBusiness(i, seed);
  ids.add(business.id);
  names.add(`${business.name}|${business.city}`);
  check(business.source === "fixture-synthesis" && business.synthetic === true, `row ${i} unlabelled`);
}
check(ids.size === SAMPLE, `business ids collided: ${ids.size}/${SAMPLE}`);
check(names.size === SAMPLE, `business names collided: ${names.size}/${SAMPLE}`);

// Determinism: same index → same row (server bake and client must agree).
const a = synthesizeBusiness(12_345, seed);
const b = synthesizeBusiness(12_345, seed);
check(JSON.stringify(a) === JSON.stringify(b), "synthesis is not deterministic");

// Violations bind to the real taxonomy, cover all of it, and stay labelled fixture.
const categoryIds = new Set(seed.categories.map((c) => c.id));
const covered = new Set<string>();
let p1Seen = 0;
for (let i = 0; i < 2_000; i += 1) {
  const business = synthesizeBusiness(i, seed);
  const violation = synthesizeViolation(i, business, seed);
  check(categoryIds.has(violation.categoryId), `violation ${i} off-taxonomy`);
  check(violation.source === "fixture-synthesis", `violation ${i} unlabelled`);
  check(violation.businessId === business.id, `violation ${i} unbound`);
  covered.add(violation.categoryId);
  if (violation.priority === "P1") p1Seen += 1;
}
check(
  covered.size === categoryIds.size,
  `synthesis reaches only ${covered.size}/${categoryIds.size} categories — stride shares a factor with the taxonomy`,
);

// The backlog P1 floor must be measured off the same mapping, not a guessed ratio.
const measuredRatio = p1RatioFromSeed(seed, 2_000);
check(
  Math.abs(measuredRatio - p1Seen / 2_000) < 1e-9,
  `p1RatioFromSeed=${measuredRatio} disagrees with the synthesized sequence`,
);

// Wall clock: the index and the backlog both advance while nobody is watching.
const now = Date.now();
const later = now + 6 * DISCOVERY_BACKLOG_TICK_MS;
check(
  discoveryIndexAt(later, seed.tickMs, seed.epochMs) >
    discoveryIndexAt(now, seed.tickMs, seed.epochMs),
  "discovery index does not advance with wall clock",
);
const nowFloor = backlogCounters(now, seed.epochMs, measuredRatio);
const laterFloor = backlogCounters(later, seed.epochMs, measuredRatio);
check(
  nowFloor.p1Violations <= nowFloor.violations,
  "backlog P1 floor exceeds the violations floor",
);
check(nowFloor.businesses > 0, "backlog floor is zero — dashboard would start frozen");
check(laterFloor.businesses > nowFloor.businesses, "backlog businesses do not grow");
check(laterFloor.violations > nowFloor.violations, "backlog violations do not grow");
check(laterFloor.p1Violations >= nowFloor.p1Violations, "backlog P1 regressed");

// Store: additive, monotonic, and stall-detecting.
discoveryStore.floor(nowFloor);
const seeded = discoveryStore.getSnapshot().businesses;
check(seeded >= nowFloor.businesses, "floor did not apply");
discoveryStore.advance({ businesses: 1, violations: 1, ticks: 1 }, now);
check(discoveryStore.getSnapshot().businesses === seeded + 1, "advance is not additive");
discoveryStore.floor({ businesses: 0, violations: 0 });
check(discoveryStore.getSnapshot().businesses === seeded + 1, "counter regressed on a lower floor");
discoveryStore.advance({ businesses: -5 }, now);
check(discoveryStore.getSnapshot().businesses === seeded + 1, "negative delta moved a counter down");
check(!discoveryStore.stalled(60_000, now + 1_000), "stall fired inside the grace window");
check(discoveryStore.stalled(60_000, now + 120_000), "stall gate never fires when discovery freezes");

// P1 identification: one number per P1, no collisions between bands, bounded menu log.
const bakedP1 = bakedP1Entries(
  (bake.anomalies ?? []).map((a) => ({
    id: a.id,
    priority: a.priority,
    title: a.title,
    entityName: a.entityName,
    categoryId: a.categoryId,
    categoryLabel: a.categoryLabel,
    indicator: a.indicator,
  })),
);
check(bakedP1.length > 0, "bake exposes no P1 events to number");
const refs = new Set(bakedP1.map((entry) => entry.ref));
check(refs.size === bakedP1.length, "baked P1 references collided");
check(
  bakedP1.every((entry, i) => entry.number === i + 1),
  "baked P1 numbering is not 1..N in catalog order",
);
for (let i = 0; i < 20_000; i += 1) {
  const ref = formatP1Ref(syntheticP1Number(bakedP1.length, i));
  if (refs.has(ref)) {
    check(false, `synthesized P1 number collides at index ${i} (${ref})`);
    break;
  }
  refs.add(ref);
}
check(refs.size === bakedP1.length + 20_000, "synthesized P1 numbers are not unique");
for (let i = 0; i < P1_LOG_CAP * 3; i += 1) {
  const number = syntheticP1Number(bakedP1.length, i);
  p1Log.record({
    number,
    ref: formatP1Ref(number),
    id: `synv-${i}`,
    title: `fixture ${i}`,
    entityName: `entity ${i}`,
    categoryLabel: "cat",
    synthetic: true,
    index: i,
  });
  p1Log.record({
    number,
    ref: formatP1Ref(number),
    id: `synv-${i}`,
    title: `fixture ${i}`,
    entityName: `entity ${i}`,
    categoryLabel: "cat",
    synthetic: true,
    index: i,
  });
}
const logged = p1Log.getSnapshot();
check(logged.length === P1_LOG_CAP, `P1 menu log is unbounded: ${logged.length}`);
check(
  new Set(logged.map((entry) => entry.ref)).size === logged.length,
  "P1 menu log kept duplicate references",
);
check(
  logged[0].number > logged[logged.length - 1].number,
  "P1 menu log is not newest-first",
);

// Reload behaviour: a fresh mount re-floors from wall clock, so it can only be higher.
const afterReload = backlogCounters(later, seed.epochMs, measuredRatio);
check(
  afterReload.businesses >= nowFloor.businesses,
  "reload would show fewer businesses than an earlier visit",
);

if (failures.length) {
  console.log("PIPELINE FAIL continuous-discovery (synthesis)");
  for (const f of failures) console.log(" -", f);
  process.exit(1);
}

console.log(
  `p1 numbering ok · baked=${bakedP1.length} synthetic-band-unique=20000 menu-cap=${P1_LOG_CAP}`,
);
console.log(
  `synthesis ok · unique=${SAMPLE} deterministic monotonic backlog(+6h)=${laterFloor.businesses - nowFloor.businesses} stall-gate=armed`,
);
