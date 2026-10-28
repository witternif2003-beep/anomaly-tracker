"use client";

import { useEffect, useState } from "react";

interface Me {
  actor: string;
  role: string;
  via: string;
}

export function AuthBar() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [pass, setPass] = useState("");
  const [operator, setOperator] = useState("operator");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));

  useEffect(() => {
    void load();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pass, operator }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "sign-in failed");
      setPass("");
      setOpen(false);
      await load();
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    await load();
    location.reload();
  }

  if (me && me.via !== "anonymous") {
    return (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="rounded border border-good/50 px-2 py-0.5 text-good">{me.actor}</span>
        <span className="text-dim">{me.role}</span>
        <button onClick={signOut} className="rounded border border-line px-2 py-0.5 text-dim hover:text-fg">
          sign out
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="rounded border border-line px-2 py-1 font-mono text-xs text-dim hover:text-fg">
        read-only · sign in
      </button>
      {open && (
        <form onSubmit={signIn} className="absolute right-0 z-30 mt-2 w-72 space-y-2 rounded-lg border border-line bg-panel p-3 shadow-xl">
          <input
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="operator name"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 font-mono text-sm"
          />
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="passphrase"
            autoComplete="current-password"
            className="w-full rounded border border-line bg-bg px-2 py-1.5 font-mono text-sm"
          />
          {error && <p className="text-xs text-bad">{error}</p>}
          <button disabled={busy} className="w-full rounded bg-accent/20 px-2 py-1.5 font-mono text-sm text-accent disabled:opacity-50">
            {busy ? "checking…" : "sign in"}
          </button>
          <p className="text-[11px] text-dim">Elevated actions require this session. Reads stay open.</p>
        </form>
      )}
    </div>
  );
}
