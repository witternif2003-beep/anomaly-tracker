/**
 * P1 identification registry — every P1 anomaly carries its own number.
 *
 * Baked P1 events are numbered 1..N in catalog order. Synthesized P1s continue
 * above that band using their deterministic discovery index, so a reference is
 * stable across reloads, tabs, and server/client renders, and two different P1s
 * can never share a number.
 *
 * Fixture bookkeeping only: numbering a row does not make it a verified filing.
 */

export type P1Entry = {
  /** Global P1 number — unique and stable per anomaly. */
  number: number;
  /** Display reference, e.g. `P1-000042`. */
  ref: string;
  id: string;
  title: string;
  entityName: string;
  city?: string;
  categoryId?: string;
  categoryLabel: string;
  indicator?: string;
  synthetic: boolean;
  /** Set for synthesized rows: the deterministic discovery index behind the row. */
  index?: number;
};

export type P1Source = {
  id: string;
  priority: string;
  title: string;
  entityName: string;
  categoryId?: string;
  categoryLabel: string;
  indicator?: string;
};

/** Newest synthesized P1s kept for the menu; the counters keep climbing past it. */
export const P1_LOG_CAP = 250;

export function formatP1Ref(number: number): string {
  return `P1-${Math.max(0, Math.floor(number)).toString().padStart(6, "0")}`;
}

/** Catalog order is the numbering order — 1-based, one number per baked P1. */
export function bakedP1Entries(anomalies: readonly P1Source[]): P1Entry[] {
  const entries: P1Entry[] = [];
  for (const anomaly of anomalies) {
    if (anomaly.priority !== "P1") continue;
    const number = entries.length + 1;
    entries.push({
      number,
      ref: formatP1Ref(number),
      id: anomaly.id,
      title: anomaly.title,
      entityName: anomaly.entityName,
      categoryId: anomaly.categoryId,
      categoryLabel: anomaly.categoryLabel,
      indicator: anomaly.indicator,
      synthetic: false,
    });
  }
  return entries;
}

/**
 * Number for a synthesized P1: reserved above the baked band and derived from the
 * discovery index, so it is collision-free without scanning the sequence.
 */
export function syntheticP1Number(bakedP1Count: number, index: number): number {
  return Math.max(0, Math.floor(bakedP1Count)) + Math.max(0, Math.floor(index)) + 1;
}

function createP1Log() {
  let snapshot: readonly P1Entry[] = Object.freeze([]);
  const listeners = new Set<() => void>();
  const seen = new Set<string>();

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): readonly P1Entry[] {
      return snapshot;
    },
    /** Stable across server render + hydration. */
    getServerSnapshot(): readonly P1Entry[] {
      return EMPTY;
    },
    /** Newest first, deduped by reference, bounded so the DOM cannot grow forever. */
    record(entry: P1Entry) {
      if (seen.has(entry.ref)) return;
      // Dedupe set is bounded too: past the retained window a repeat is unreachable.
      if (seen.size > P1_LOG_CAP * 4) seen.clear();
      seen.add(entry.ref);
      snapshot = Object.freeze([entry, ...snapshot].slice(0, P1_LOG_CAP));
      for (const listener of listeners) listener();
    },
  };
}

const EMPTY: readonly P1Entry[] = Object.freeze([]);

export const p1Log = createP1Log();
