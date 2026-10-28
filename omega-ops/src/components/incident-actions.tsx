"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const NEXT: Record<string, string[]> = { open: ["triaged", "mitigated", "closed"], triaged: ["mitigated", "closed"], mitigated: ["closed", "open"], closed: ["open"] };

export function IncidentActions({ id, state }: { id: string; state: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function move(to: string) {
    setErr(null);
    const res = await fetch(`/api/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: to }) });
    if (!res.ok) setErr((await res.json()).error ?? "update failed");
    else router.refresh();
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {(NEXT[state] ?? []).map((s) => (
        <button key={s} onClick={() => move(s)} className="rounded border border-line px-1.5 text-[11px] text-dim hover:text-fg">
          → {s}
        </button>
      ))}
      {err && <span className="text-[11px] text-bad">{err}</span>}
    </span>
  );
}
