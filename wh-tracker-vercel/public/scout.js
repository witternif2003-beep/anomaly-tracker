// Scout bot: watches the running viewer for real failures and keeps them in a
// deduplicated queue. Everything it records is an observed event in this browser
// session — an uncaught exception, a rejected promise, a non-ok/failed request or
// a failed endpoint probe. Nothing is synthesised, and the queue is client-side
// only (sessionStorage), so no unauthenticated write endpoint is introduced.

const STORAGE_KEY = "wh-tracker.error-queue.v1";
const MAX_ENTRIES = 50;

const SEVERITY_BY_KIND = {
  exception: "critical",
  rejection: "critical",
  probe: "high",
  request: "high",
  resource: "medium",
};

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(entries) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private-mode / quota failures must not break the viewer.
  }
}

export function createScout({ endpoints = [], probeIntervalMs = 60000 } = {}) {
  // Captured before `install()` wraps window.fetch so a probe failure is recorded
  // once, as a probe, rather than also as a request failure.
  const nativeFetch = window.fetch.bind(window);
  let entries = load();
  const listeners = new Set();

  const emit = () => {
    persist(entries);
    for (const listener of listeners) listener(entries);
  };

  function record({ kind, message, detail = "", source = "viewer" }) {
    const key = `${kind}|${source}|${message}`;
    const now = new Date().toISOString();
    const existing = entries.find((e) => e.key === key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
      if (detail) existing.detail = detail;
    } else {
      entries.unshift({
        key,
        kind,
        severity: SEVERITY_BY_KIND[kind] || "medium",
        message,
        detail,
        source,
        count: 1,
        firstSeen: now,
        lastSeen: now,
      });
      entries = entries.slice(0, MAX_ENTRIES);
    }
    emit();
  }

  function clear() {
    entries = [];
    emit();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(entries);
    return () => listeners.delete(listener);
  }

  function install() {
    window.addEventListener("error", (event) => {
      if (event.target instanceof HTMLElement && event.target !== window) {
        const url = event.target.currentSrc || event.target.src || event.target.href;
        if (url) {
          record({ kind: "resource", message: `failed to load ${url}`, source: "browser" });
          return;
        }
      }
      record({
        kind: "exception",
        message: event.message || "uncaught error",
        detail: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "",
        source: "browser",
      });
    }, true);

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      record({
        kind: "rejection",
        message: reason?.message || String(reason || "unhandled rejection"),
        detail: reason?.stack?.split("\n")[1]?.trim() || "",
        source: "browser",
      });
    });

    // Wrap fetch so API failures land in the queue even when the caller handles
    // them, which is how "connecting…" states get explained rather than guessed.
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url || String(input);
      try {
        const res = await nativeFetch(input, init);
        if (!res.ok) {
          record({ kind: "request", message: `HTTP ${res.status} ${path(url)}`, source: "api" });
        }
        return res;
      } catch (err) {
        record({ kind: "request", message: `${path(url)} — ${err.message}`, source: "api" });
        throw err;
      }
    };
  }

  async function probe() {
    await Promise.all(
      endpoints.map(async (endpoint) => {
        const started = performance.now();
        try {
          const res = await nativeFetch(endpoint, { cache: "no-store" });
          if (!res.ok) {
            record({
              kind: "probe",
              message: `${endpoint} returned HTTP ${res.status}`,
              detail: `${Math.round(performance.now() - started)} ms`,
              source: "scout",
            });
          }
        } catch (err) {
          record({
            kind: "probe",
            message: `${endpoint} unreachable — ${err.message}`,
            source: "scout",
          });
        }
      })
    );
  }

  function start() {
    install();
    probe();
    setInterval(probe, probeIntervalMs);
  }

  return { record, clear, subscribe, start, probe, get entries() { return entries; } };
}

function path(url) {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return String(url);
  }
}
