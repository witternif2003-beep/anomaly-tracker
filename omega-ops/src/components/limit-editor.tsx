"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LimitEditor({ batchMax, dailyMax }: { batchMax: number; dailyMax: number }) {
  const router = useRouter();
  const [vals, setVals] = useState({ batch_max: String(batchMax), daily_max: String(dailyMax) });
  const [msg, setMsg] = useState<string | null>(null);
  async function save(key: "batch_max" | "daily_max") {
    setMsg(null);
    const res = await fetch("/api/limits", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, units: Number(vals[key]) }) });
    const data = await res.json();
    setMsg(res.ok ? `${key} saved` : (data.error ?? "update failed"));
    if (res.ok) router.refresh();
  }
  return (
    <div className="flex flex-wrap items-end gap-4 font-mono text-xs">
      {(["batch_max", "daily_max"] as const).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className="text-dim">{k}</span>
          <span className="flex gap-1">
            <input inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} className="w-28 rounded border border-line bg-bg px-2 py-1" />
            <button onClick={() => save(k)} className="rounded border border-line px-2 text-dim hover:text-fg">save</button>
          </span>
        </label>
      ))}
      {msg && <span className="text-dim">{msg}</span>}
    </div>
  );
}
