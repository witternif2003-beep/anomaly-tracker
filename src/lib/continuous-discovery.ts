/**
 * Continuous discovery synthesis — the fixture roster is a seed, not a ceiling.
 *
 * The baked candidate pool is finite, so replaying it pins the dashboard at a
 * constant. This expands an unbounded, deterministic sequence of fixture
 * businesses and violations from that seed (same index → same row on server and
 * client), mirroring the virtual expand of the post-doc catalog.
 *
 * Fixture synthesis only: no registry, credit, or law-enforcement lookup happens
 * here, and every synthesized row is labelled so a rising counter can never be
 * read as live surveillance.
 */

/** Fixed anchor so counters track wall-clock, not tab uptime or build time. */
export const DISCOVERY_EPOCH_MS = Date.UTC(2026, 0, 1);
export const DISCOVERY_TICK_MS = 2_200;
/**
 * Rate the 24/7 backlog is credited at while nobody has the console open. Kept far
 * slower than the live tick so an unattended week reads as a plausible caseload
 * rather than millions of fixture rows.
 */
export const DISCOVERY_BACKLOG_TICK_MS = 3_600_000;
/** Bijective mixer (prime, so coprime with every corpus period). */
const MIX_ODD = 2_654_435_761;
const STORE_KEY = "lyra.discovery.highwater.v1";

export type DiscoverySeed = {
  epochMs?: number;
  tickMs?: number;
  namePrefixes: string[];
  nameCores: string[];
  nameSuffixes: string[];
  cities: string[];
  sectors: string[];
  entityTypes: string[];
  channels: Array<{ id: string; label: string }>;
  categories: Array<{ id: string; label: string; priority?: string }>;
};

export type SyntheticBusiness = {
  id: string;
  index: number;
  name: string;
  city: string;
  sector: string;
  entityType: string;
  priority: "P1" | "P2" | "P3";
  channelId: string;
  channelLabel: string;
  signal: string;
  fingerprint: string;
  source: "fixture-synthesis";
  synthetic: true;
  discoveredAtMs: number;
};

export type SyntheticViolation = {
  id: string;
  index: number;
  businessId: string;
  businessName: string;
  city: string;
  categoryId: string;
  categoryLabel: string;
  priority: "P1" | "P2" | "P3";
  title: string;
  indicator: string;
  documentation: string;
  source: "fixture-synthesis";
  synthetic: true;
};

export type DiscoveryCounters = {
  /** Fixture businesses admitted beyond the baked roster. */
  businesses: number;
  discovered: number;
  autoQueued: number;
  documented: number;
  violations: number;
  p1Violations: number;
  ticks: number;
  /** Epoch ms of the last counter advance — the stall detector reads this. */
  lastAdvanceMs: number;
};

const ZERO: DiscoveryCounters = Object.freeze({
  businesses: 0,
  discovered: 0,
  autoQueued: 0,
  documented: 0,
  violations: 0,
  p1Violations: 0,
  ticks: 0,
  lastAdvanceMs: 0,
});

function pick<T>(list: readonly T[], slot: number): T {
  return list[((slot % list.length) + list.length) % list.length];
}

/** Mixed-radix decomposition of a permuted index: unique tuples per period. */
function tuple(index: number, radices: number[]): number[] {
  const period = radices.reduce((a, b) => a * Math.max(1, b), 1);
  let mixed = ((index % period) * MIX_ODD) % period;
  return radices.map((radix) => {
    const size = Math.max(1, radix);
    const digit = mixed % size;
    mixed = Math.floor(mixed / size);
    return digit;
  });
}

function priorityFor(index: number): "P1" | "P2" | "P3" {
  if (index % 3 === 0) return "P1";
  return index % 2 === 0 ? "P2" : "P3";
}

/** 32-bit FNV-1a — fingerprint only, never a security boundary. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function synthesizeBusiness(index: number, seed: DiscoverySeed): SyntheticBusiness {
  const slot = Math.max(0, Math.floor(index));
  const radices = [
    seed.namePrefixes.length,
    seed.nameCores.length,
    seed.nameSuffixes.length,
    seed.cities.length,
  ];
  const period = radices.reduce((a, b) => a * Math.max(1, b), 1);
  const [p, c, s, ci] = tuple(slot, radices);
  const cohort = Math.floor(slot / period);
  const base = `${pick(seed.namePrefixes, p)} ${pick(seed.nameCores, c)} ${pick(seed.nameSuffixes, s)}`;
  const name = cohort ? `${base} ${cohort + 1}` : base;
  const channel = pick(seed.channels, slot);
  const tickMs = seed.tickMs ?? DISCOVERY_TICK_MS;
  const epochMs = seed.epochMs ?? DISCOVERY_EPOCH_MS;

  return {
    id: `syn-${slot.toString(36)}-${fnv1a(`${slot}:${name}`)}`,
    index: slot,
    name,
    city: pick(seed.cities, ci),
    sector: pick(seed.sectors, slot),
    entityType: pick(seed.entityTypes, slot),
    priority: priorityFor(slot),
    channelId: channel.id,
    channelLabel: channel.label,
    signal: `Synthesized discovery pulse via ${channel.label} (fixture — no live registry query)`,
    fingerprint: fnv1a(`${name}|${slot}`),
    source: "fixture-synthesis",
    synthetic: true,
    discoveredAtMs: epochMs + slot * tickMs,
  };
}

export function synthesizeViolation(
  index: number,
  business: SyntheticBusiness,
  seed: DiscoverySeed,
): SyntheticViolation {
  const slot = Math.max(0, Math.floor(index));
  const category = pick(seed.categories, slot * 7 + business.index);
  const priority = (category.priority === "P1" || category.priority === "P2"
    ? category.priority
    : business.priority) as "P1" | "P2" | "P3";
  const serial = `${business.fingerprint.slice(0, 6)}-${slot.toString(36).toUpperCase()}`;

  return {
    id: `synv-${business.id}-${slot.toString(36)}`,
    index: slot,
    businessId: business.id,
    businessName: business.name,
    city: business.city,
    categoryId: category.id,
    categoryLabel: category.label,
    priority,
    title: `${category.label} indicator — ${business.name}`,
    indicator: `FIX-${serial}`,
    documentation: `Documented ${category.label} indicator for ${business.name} (${business.city}) under the corporate taxonomy — fixture narrative, not a live filing.`,
    source: "fixture-synthesis",
    synthetic: true,
  };
}

/** Wall-clock → discovery index, so the search advances while nobody is watching. */
export function discoveryIndexAt(
  nowMs: number,
  tickMs: number = DISCOVERY_TICK_MS,
  epochMs: number = DISCOVERY_EPOCH_MS,
): number {
  const span = nowMs - epochMs;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.floor(span / Math.max(1, tickMs));
}

function readHighWater(): DiscoveryCounters {
  if (typeof window === "undefined") return ZERO;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return ZERO;
    const parsed = JSON.parse(raw) as Partial<DiscoveryCounters>;
    return clampUp(ZERO, parsed);
  } catch {
    return ZERO;
  }
}

function writeHighWater(counters: DiscoveryCounters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(counters));
  } catch {
    // Private mode / quota — counters stay monotonic in memory.
  }
}

/** Monotonic merge: a counter never moves down, whatever the caller passes. */
function clampUp(
  prev: DiscoveryCounters,
  next: Partial<DiscoveryCounters>,
): DiscoveryCounters {
  const merge = (key: keyof DiscoveryCounters) => {
    const candidate = Number(next[key]);
    return Number.isFinite(candidate) ? Math.max(prev[key], candidate) : prev[key];
  };
  return {
    businesses: merge("businesses"),
    discovered: merge("discovered"),
    autoQueued: merge("autoQueued"),
    documented: merge("documented"),
    violations: merge("violations"),
    p1Violations: merge("p1Violations"),
    ticks: merge("ticks"),
    lastAdvanceMs: merge("lastAdvanceMs"),
  };
}

function createStore() {
  let snapshot: DiscoveryCounters = ZERO;
  let hydrated = false;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const commit = (next: DiscoveryCounters) => {
    const changed = (Object.keys(next) as Array<keyof DiscoveryCounters>).some(
      (key) => next[key] !== snapshot[key],
    );
    if (!changed) return;
    snapshot = Object.freeze(next);
    writeHighWater(snapshot);
    emit();
  };

  return {
    subscribe(listener: () => void) {
      if (!hydrated) {
        hydrated = true;
        const stored = readHighWater();
        if (stored !== ZERO) snapshot = Object.freeze(clampUp(snapshot, stored));
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): DiscoveryCounters {
      return snapshot;
    },
    /** Stable across server render + hydration — no growing value in the HTML. */
    getServerSnapshot(): DiscoveryCounters {
      return ZERO;
    },
    /** Raise counters to at least these values (used to seed the wall-clock floor). */
    floor(next: Partial<DiscoveryCounters>) {
      commit(clampUp(snapshot, next));
    },
    /** Add to counters; deltas are clamped so the result can only grow. */
    advance(delta: Partial<DiscoveryCounters>, atMs = Date.now()) {
      const additive: Partial<DiscoveryCounters> = { lastAdvanceMs: atMs };
      for (const [key, value] of Object.entries(delta) as Array<
        [keyof DiscoveryCounters, number | undefined]
      >) {
        if (key === "lastAdvanceMs") continue;
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        additive[key] = snapshot[key] + amount;
      }
      commit(clampUp(snapshot, additive));
    },
    /** True when the search has visibly stopped advancing — the frozen-fixture regression. */
    stalled(graceMs: number, nowMs = Date.now()) {
      if (!snapshot.lastAdvanceMs) return false;
      return nowMs - snapshot.lastAdvanceMs > graceMs;
    },
  };
}

export const discoveryStore = createStore();

/**
 * Counters the 24/7 backlog has earned by `nowMs`, independent of any tab being
 * open — this is what makes the dashboard higher on every visit.
 */
export function backlogCounters(
  nowMs = Date.now(),
  epochMs: number = DISCOVERY_EPOCH_MS,
): DiscoveryCounters {
  const backlog = discoveryIndexAt(nowMs, DISCOVERY_BACKLOG_TICK_MS, epochMs);
  return {
    businesses: backlog,
    discovered: backlog,
    autoQueued: backlog,
    documented: backlog,
    violations: backlog,
    p1Violations: Math.ceil(backlog / 3),
    ticks: 0,
    lastAdvanceMs: 0,
  };
}

export function seedFromScanPayload(payload: {
  discoverySynthesis?: DiscoverySeed;
}): DiscoverySeed | null {
  const seed = payload.discoverySynthesis;
  if (!seed?.namePrefixes?.length || !seed.nameCores?.length || !seed.cities?.length) {
    return null;
  }
  return seed;
}
