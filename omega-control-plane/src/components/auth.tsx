"use client";
import { useCallback, useEffect, useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { api, short } from "@/lib/client";
import { connect, hasWallet, NoWalletError, phantomBrowseUrl } from "@/lib/wallet";

let listeners: Array<(a: string | null) => void> = [];
let current: string | null | undefined;

async function loadMe() {
  const { address } = await api<{ address: string | null }>("/api/auth/me").catch(() => ({ address: null }));
  current = address;
  listeners.forEach((l) => l(address));
}

export function useMe() {
  const [address, setAddress] = useState<string | null>(current ?? null);
  useEffect(() => {
    listeners.push(setAddress);
    if (current === undefined) void loadMe();
    return () => {
      listeners = listeners.filter((l) => l !== setAddress);
    };
  }, []);
  return { address, refresh: () => void loadMe() };
}

export function AuthBar() {
  const { address, refresh } = useMe();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [noWallet, setNoWallet] = useState(false);

  const signIn = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setNoWallet(false);
    try {
      const w = await connect();
      const { nonce } = await api<{ nonce: string }>("/api/auth/nonce");
      const message = createSiweMessage({
        domain: window.location.host,
        address: w.address,
        statement: "Sign in to the Omega control plane. This signature does not move funds.",
        uri: window.location.origin,
        version: "1",
        chainId: 8453,
        nonce,
        issuedAt: new Date(),
      });
      const signature = await w.sign(message);
      await api("/api/auth/siwe", { method: "POST", body: JSON.stringify({ message, signature }) });
      refresh();
    } catch (e) {
      setNoWallet(e instanceof NoWalletError);
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  if (address) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded border border-good/40 px-2 py-1 font-mono text-good">{short(address)}</span>
        <button
          className="rounded border border-line px-2 py-1 text-dim hover:text-fg"
          onClick={async () => {
            await api("/api/auth/logout", { method: "POST" });
            refresh();
          }}
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={busy}
        onClick={signIn}
        className="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-50"
        title={hasWallet() ? "" : "Needs an injected Ethereum wallet"}
      >
        {busy ? "Waiting for wallet…" : "Sign in with Ethereum"}
      </button>
      {noWallet ? (
        <div className="flex max-w-64 flex-col items-end gap-1 text-right text-[11px]">
          <a href={phantomBrowseUrl()} className="rounded border border-[#ab9ff2] px-3 py-1.5 text-xs font-semibold text-[#ab9ff2]">
            Open in Phantom
          </a>
          <span className="text-dim">No wallet in this browser. This reopens the page inside Phantom, where you can sign in.</span>
        </div>
      ) : (
        err && <span className="max-w-64 text-right text-[11px] text-bad">{err}</span>
      )}
    </div>
  );
}
