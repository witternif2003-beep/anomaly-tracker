"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { walletErrorText } from "@/lib/wallet";

export default function HandoffPage() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const redeem = async () => {
    setState("busy");
    setErr(null);
    try {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
      await api("/api/auth/handoff", { method: "PUT", body: JSON.stringify({ token }) });
      history.replaceState(null, "", "/handoff");
      setState("done");
      // Full reload so every component re-reads the new session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
    } catch (e) {
      setErr(walletErrorText(e));
      setState("idle");
    }
  };
  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      <h1 className="text-xl font-semibold">Sign in this browser</h1>
      <p className="text-sm text-dim">
        Signs this browser in as the wallet that created the link. The link works once and expires 2 minutes after it was made.
        Wallet-signed actions (topups, payouts, Soul edits) still need the wallet app.
      </p>
      <button disabled={state !== "idle"} onClick={redeem} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">
        {state === "busy" ? "Signing in…" : state === "done" ? "Signed in" : "Sign in this browser"}
      </button>
      {err && <p className="text-sm text-bad">{err}</p>}
      <p className="text-xs text-dim">source: PUT /api/auth/handoff (single-use token, SHA-256 stored, audit-logged)</p>
    </div>
  );
}
