"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunBatch() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/batches", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "batch failed");
      setMsg(`B-${String(data.batchId).padStart(6, "0")} · ${data.newFindings} new · ${data.changedFindings} changed · ${data.durationMs} ms`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "batch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={run} disabled={busy} className="rounded border border-accent/50 bg-accent/10 px-3 py-1 font-mono text-xs text-accent disabled:opacity-50">
        {busy ? "running batch…" : "run batch now"}
      </button>
      {msg && <span className="font-mono text-[11px] text-good">{msg}</span>}
      {err && <span className="font-mono text-[11px] text-bad">{err}</span>}
    </div>
  );
}
