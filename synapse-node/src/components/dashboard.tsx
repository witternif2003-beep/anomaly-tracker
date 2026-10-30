"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BatchView, PromptView, TelemetrySummary } from "@/lib/queries";
import { AuthBar } from "./auth-bar";

interface Health {
  ok: boolean;
  database: string;
  deepseek: string;
  model: string;
  thinking: string;
  batchIntervalSec: number;
  dailyBatchCap: number;
  operatorAuth: string;
  activePrompts: number | null;
  batchInProgressUntil: string | null;
  commit: string | null;
}

interface Me {
  actor: string;
  operator: boolean;
}

type Conn = "connecting" | "live" | "reconnecting" | "offline";

const fmt = (n: number | null | undefined, digits = 0) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: digits }));

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export function Dashboard() {
  const [me, setMe] = useState<Me>({ actor: "anonymous", operator: false });
  const [health, setHealth] = useState<Health | null>(null);
  const [prompts, setPrompts] = useState<PromptView[]>([]);
  const [selected, setSelected] = useState<string>("all");
  const [batches, setBatches] = useState<BatchView[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [instruction, setInstruction] = useState("");
  const seen = useRef(new Set<string>());

  const refreshMeta = useCallback(async () => {
    const q = selected === "all" ? "" : `?prompt=${selected}`;
    const [m, h, p, t] = await Promise.allSettled([
      api<Me>("/api/auth/me"),
      api<Health>("/api/health"),
      api<{ prompts: PromptView[] }>("/api/prompts"),
      api<TelemetrySummary>(`/api/telemetry${q}`),
    ]);
    if (m.status === "fulfilled") setMe(m.value);
    if (h.status === "fulfilled") setHealth(h.value);
    if (p.status === "fulfilled") setPrompts(p.value.prompts);
    if (t.status === "fulfilled") setTelemetry(t.value);
  }, [selected]);

  useEffect(() => {
    const first = setTimeout(() => void refreshMeta(), 0);
    const id = setInterval(() => void refreshMeta(), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refreshMeta]);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    seen.current = new Set();
    const q = selected === "all" ? "" : `prompt=${selected}&`;
    api<{ batches: BatchView[] }>(`/api/batches?${q}limit=60`)
      .then(({ batches: initial }) => {
        if (cancelled) return;
        initial.forEach((b) => seen.current.add(b.id));
        setBatches(initial);
        const after = initial.length ? Math.max(...initial.map((b) => b.seq)) : 0;
        es = new EventSource(`/api/stream-batches/${selected}?after=${after}`);
        es.onopen = () => setConn("live");
        es.addEventListener("batch", (ev) => {
          const b = JSON.parse((ev as MessageEvent).data) as BatchView;
          if (seen.current.has(b.id)) return;
          seen.current.add(b.id);
          setBatches((prev) => [b, ...prev].slice(0, 300));
          void refreshMeta();
        });
        es.addEventListener("engine", (ev) => {
          const r = JSON.parse((ev as MessageEvent).data) as { ran: boolean; reason?: string; batchNumber?: number; status?: string };
          setEngineNote(r.ran ? `batch ${r.batchNumber} ${r.status}` : (r.reason ?? null));
        });
        es.onerror = () => setConn(es?.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
      })
      .catch((err: unknown) => {
        setConn("offline");
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [selected, refreshMeta]);

  const select = (id: string) => {
    if (id === selected) return;
    setBatches([]);
    setConn("connecting");
    setSelected(id);
  };

  const current = useMemo(() => prompts.find((p) => p.id === selected) ?? null, [prompts, selected]);
  const anyActive = prompts.some((p) => p.status === "ACTIVE");
  const processing = current ? current.status === "ACTIVE" : anyActive;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refreshMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const initiate = () =>
    run(async () => {
      const r = await api<{ prompt_id: string }>("/api/initiate-protocol", { method: "POST", body: JSON.stringify({ prompt: promptText, instruction }) });
      setPromptText("");
      setInstruction("");
      select(r.prompt_id);
    });
  const setStatus = (id: string, status: string) => run(() => api(`/api/prompts/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
  const runNow = () =>
    run(async () => {
      const r = await api<{ ran: boolean; reason?: string; batchNumber?: number; status?: string }>(`/api/tick${current ? `?prompt=${current.id}` : ""}`, { method: "POST" });
      setEngineNote(r.ran ? `batch ${r.batchNumber} ${r.status}` : (r.reason ?? null));
    });

  const connColor = conn === "live" ? "bg-emerald-500" : conn === "offline" ? "bg-red-500" : "bg-yellow-400";

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-emerald-500 sm:p-8">
      <header className="mb-6 flex flex-col gap-3 border-b border-emerald-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold uppercase tracking-widest break-words sm:text-3xl">Synapse-Node Dashboard v3.4</h1>
          <p className="mt-2 text-xs text-emerald-700">
            STATUS: {processing ? "ACTIVE PROCESSING" : "STANDBY"} · MODEL {health?.model ?? "—"} · THINKING {health?.thinking ?? "—"} · INTERVAL{" "}
            {health ? `${health.batchIntervalSec}s` : "—"} · CAP {health ? `${health.dailyBatchCap}/24h` : "—"}
          </p>
        </div>
        <AuthBar actor={me.actor} operator={me.operator} onChange={() => void refreshMeta()} />
      </header>

      {health && health.deepseek !== "configured" && (
        <div className="mb-4 border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">
          ENGINE OFFLINE: {health.deepseek}. No batches are generated until the key is set in the deployment environment.
        </div>
      )}
      {health && health.database !== "ok" && <div className="mb-4 border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">DATABASE {health.database.toUpperCase()}</div>}
      {error && <div className="mb-4 border border-red-800 bg-red-950/40 p-3 text-xs text-red-300">{error}</div>}

      {me.operator && (
        <section className="mb-6 border border-emerald-900 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-bold tracking-widest text-emerald-300">NEW MASTER PROMPT</h2>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={4}
            placeholder="Master prompt sent to DeepSeek on every batch…"
            className="w-full border border-emerald-900 bg-slate-950 p-2 text-base text-emerald-300 placeholder:text-emerald-900 sm:text-sm"
          />
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Per-batch instruction (optional)"
            className="mt-2 w-full border border-emerald-900 bg-slate-950 p-2 text-base text-emerald-300 placeholder:text-emerald-900 sm:text-sm"
          />
          <button
            disabled={busy || !promptText.trim()}
            onClick={initiate}
            className="mt-3 border border-emerald-500 px-6 py-2 text-emerald-400 transition-colors hover:bg-emerald-950 disabled:opacity-40"
          >
            INITIATE MASTER PROMPT
          </button>
        </section>
      )}

      <section className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={selected}
          onChange={(e) => select(e.target.value)}
          className="max-w-full border border-emerald-800 bg-slate-950 px-2 py-2 text-base text-emerald-300 sm:text-sm"
        >
          <option value="all">ALL PROMPTS ({prompts.length})</option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>
              [{p.status}] {p.promptText.slice(0, 50)} · {p.batches} batches
            </option>
          ))}
        </select>
        {me.operator && current && (
          <>
            {current.status === "ACTIVE" ? (
              <button disabled={busy} onClick={() => setStatus(current.id, "PAUSED")} className="border border-red-500 px-4 py-2 text-red-500 hover:bg-red-950 disabled:opacity-40">
                HALT PROTOCOL
              </button>
            ) : (
              <button disabled={busy} onClick={() => setStatus(current.id, "ACTIVE")} className="border border-emerald-500 px-4 py-2 text-emerald-400 hover:bg-emerald-950 disabled:opacity-40">
                RESUME PROTOCOL
              </button>
            )}
            {current.status !== "COMPLETED" && (
              <button disabled={busy} onClick={() => setStatus(current.id, "COMPLETED")} className="border border-emerald-900 px-4 py-2 text-emerald-700 hover:text-emerald-400 disabled:opacity-40">
                MARK COMPLETED
              </button>
            )}
          </>
        )}
        {me.operator && (
          <button disabled={busy} onClick={runNow} className="border border-emerald-700 px-4 py-2 text-emerald-500 hover:bg-emerald-950 disabled:opacity-40">
            {busy ? "WORKING…" : "RUN BATCH NOW"}
          </button>
        )}
        <div className="flex items-center text-sm">
          <span className={`mr-2 h-2 w-2 rounded-full ${connColor} ${conn === "live" ? "animate-pulse" : ""}`} />
          SSE {conn.toUpperCase()} · {batches.length} batches shown
          {engineNote && <span className="ml-2 text-xs text-emerald-700">· engine: {engineNote}</span>}
        </div>
      </section>

      {current && (
        <section className="mb-6 border border-emerald-900 p-3 text-xs text-emerald-600">
          <div className="mb-1 text-emerald-300">MASTER PROMPT · {current.status} · by {current.createdBy} · {new Date(current.createdAt).toLocaleString()}</div>
          <pre className="text-emerald-500">{current.promptText}</pre>
          {current.instruction && <pre className="mt-1 text-emerald-700">INSTRUCTION: {current.instruction}</pre>}
        </section>
      )}

      <section className="mb-6 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
        {[
          ["BATCHES", fmt(telemetry?.batches)],
          ["OK / ERROR", telemetry ? `${telemetry.ok} / ${telemetry.errors}` : "—"],
          ["JSON VALID", telemetry?.jsonValidRate == null ? "—" : `${fmt(telemetry.jsonValidRate * 100, 1)}%`],
          ["LATENCY P50", telemetry?.latencyP50Ms == null ? "—" : `${fmt(telemetry.latencyP50Ms)} ms`],
          ["LATENCY P95", telemetry?.latencyP95Ms == null ? "—" : `${fmt(telemetry.latencyP95Ms)} ms`],
          ["AVG ATTEMPTS", fmt(telemetry?.avgAttempts, 2)],
          ["TOKENS IN / OUT", telemetry ? `${fmt(telemetry.promptTokens)} / ${fmt(telemetry.completionTokens)}` : "—"],
          ["LAST 24H", fmt(telemetry?.last24h)],
        ].map(([k, v]) => (
          <div key={k} className="border border-emerald-900 bg-slate-900 p-2">
            <div className="text-emerald-700">{k}</div>
            <div className="mt-1 text-base text-emerald-300">{v}</div>
          </div>
        ))}
      </section>

      {batches.length === 0 && (
        <p className="border border-dashed border-emerald-900 p-6 text-center text-sm text-emerald-700">
          No batches yet.{" "}
          {health?.deepseek !== "configured" ? "Engine is offline (no DeepSeek key)." : prompts.length ? "Waiting for the next batch…" : "Sign in as operator and initiate a master prompt."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {batches.map((b) => (
          <BatchCard key={b.id} b={b} />
        ))}
      </div>

      <footer className="mt-10 border-t border-emerald-900 pt-4 text-[11px] text-emerald-800">
        Batch contents are DeepSeek model output for an operator-supplied prompt: unverified, not facts. Telemetry values are measured from each API request.
        {health?.commit && ` · build ${health.commit}`}
      </footer>
    </div>
  );
}

function BatchCard({ b }: { b: BatchView }) {
  const summary = typeof b.data?.summary === "string" ? b.data.summary : null;
  const metrics = b.data && typeof b.data.metrics === "object" ? b.data.metrics : null;
  return (
    <div className={`border bg-slate-900 p-4 shadow-[0_0_15px_rgba(16,185,129,0.1)] ${b.status === "OK" ? "border-emerald-900" : "border-red-900"}`}>
      <div className="mb-2 flex justify-between gap-2 border-b border-emerald-900 pb-2">
        <span className="font-bold text-emerald-300">BATCH {b.batch}</span>
        <span className={`px-2 py-1 text-xs ${b.status === "OK" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-200"}`}>
          {b.status === "OK" ? "MODEL OUTPUT · UNVERIFIED" : "ERROR"}
        </span>
      </div>
      <div className="space-y-2 text-sm">
        {b.status === "OK" ? (
          <>
            <p>
              <span className="text-emerald-700">CODENAME:</span> {b.codename ?? "—"}
            </p>
            {summary && (
              <p>
                <span className="text-emerald-700">SUMMARY:</span> {summary}
              </p>
            )}
            <p>
              <span className="text-emerald-700">MODEL SCORE:</span> {b.score ?? "—"} <span className="text-[10px] text-emerald-800">(self-reported)</span>
            </p>
          </>
        ) : (
          <p className="break-words text-red-300">{b.error}</p>
        )}
        <p className="text-xs text-emerald-800">
          {new Date(b.processedAt).toLocaleString()} · {b.model} · {b.telemetry.M01_latency_ms ?? "—"} ms · {b.telemetry.M06_total_tokens ?? "—"} tok
        </p>
      </div>
      <div className="mt-4 border-t border-emerald-900 pt-4">
        <details className="cursor-pointer">
          <summary className="text-xs text-emerald-600 hover:text-emerald-400">MEASURED TELEMETRY ({Object.keys(b.telemetry).length})</summary>
          <pre className="mt-2 overflow-x-auto text-xs text-emerald-600">{JSON.stringify(b.telemetry, null, 2)}</pre>
        </details>
        {metrics && (
          <details className="mt-2 cursor-pointer">
            <summary className="text-xs text-emerald-600 hover:text-emerald-400">MODEL METRICS</summary>
            <pre className="mt-2 overflow-x-auto text-xs text-emerald-700">{JSON.stringify(metrics, null, 2)}</pre>
          </details>
        )}
        {b.data && (
          <details className="mt-2 cursor-pointer">
            <summary className="text-xs text-emerald-600 hover:text-emerald-400">RAW JSON</summary>
            <pre className="mt-2 overflow-x-auto text-xs text-emerald-700">{JSON.stringify(b.data, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
