"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AssetForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", vendor: "", product: "", class: "service", criticality: "standard", owner: "", group: "" });
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const body = { ...f, vendor: f.vendor || null, product: f.product || null, owner: f.owner || null, group: f.group.trim() || null };
    const res = await fetch("/api/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error ?? "failed");
    setF({ ...f, name: "", vendor: "", product: "", owner: "" });
    router.refresh();
  }
  const input = "rounded border border-line bg-bg px-2 py-1";
  return (
    <form onSubmit={submit} className="grid gap-2 font-mono text-xs sm:grid-cols-3">
      <input required placeholder="asset name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
      <input placeholder="vendor (as catalogued)" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} className={input} />
      <input placeholder="product (as catalogued)" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })} className={input} />
      <select value={f.class} onChange={(e) => setF({ ...f, class: e.target.value })} className={input}>
        {["service", "host", "appliance", "library", "pipeline"].map((c) => <option key={c}>{c}</option>)}
      </select>
      <select value={f.criticality} onChange={(e) => setF({ ...f, criticality: e.target.value })} className={input}>
        {["standard", "elevated", "critical"].map((c) => <option key={c}>{c}</option>)}
      </select>
      <input placeholder="owning team" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} className={input} />
      <input placeholder="asset group (organisation)" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} className={`${input} sm:col-span-3`} />
      <button className="rounded border border-accent/50 px-2 py-1 text-accent sm:col-span-3">register authorized asset</button>
      {msg && <span className="text-bad sm:col-span-3">{msg}</span>}
    </form>
  );
}
