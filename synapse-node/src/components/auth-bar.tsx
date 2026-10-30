"use client";

import { useState } from "react";

export function AuthBar({ actor, operator, onChange }: { actor: string; operator: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [name, setName] = useState("operator");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pass, operator: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "sign-in failed");
      setPass("");
      setOpen(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (operator) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="border border-emerald-600 px-2 py-1 text-emerald-300">{actor}</span>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            onChange();
          }}
          className="border border-emerald-900 px-2 py-1 text-emerald-700 hover:text-emerald-400"
        >
          SIGN OUT
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="border border-emerald-900 px-3 py-1 text-xs text-emerald-600 hover:text-emerald-300">
        READ-ONLY · OPERATOR SIGN IN
      </button>
      {open && (
        <form onSubmit={signIn} className="absolute right-0 z-30 mt-2 w-72 space-y-2 border border-emerald-800 bg-slate-900 p-3 shadow-xl">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="operator name"
            className="w-full border border-emerald-900 bg-slate-950 px-2 py-1.5 text-base text-emerald-300 sm:text-sm"
          />
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="passphrase"
            autoComplete="current-password"
            className="w-full border border-emerald-900 bg-slate-950 px-2 py-1.5 text-base text-emerald-300 sm:text-sm"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button disabled={busy} className="w-full border border-emerald-500 px-2 py-1.5 text-sm text-emerald-300 hover:bg-emerald-950 disabled:opacity-50">
            {busy ? "CHECKING…" : "SIGN IN"}
          </button>
        </form>
      )}
    </div>
  );
}
