"use client";
import { useState } from "react";
import { Card } from "@/components/ui";
import { api, useApi } from "@/lib/client";

export function useTotpStatus(me: string | null) {
  const { data, reload } = useApi<{ enabled: boolean }>(me ? "/api/auth/totp" : null);
  return { enabled: !!data?.enabled, known: !!data, reload };
}

export function TotpCodeInput({ value, onChange, what }: { value: string; onChange: (v: string) => void; what: string }) {
  return (
    <label className="block rounded border border-accent/40 bg-panel p-3 text-xs text-dim">
      2FA code from your authenticator app, needed for {what}. Each code works once.
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="123456"
        className="mt-2 block w-32 rounded border border-line bg-bg px-2 py-1.5 font-mono text-base tracking-widest text-fg"
      />
    </label>
  );
}

export function TwoFactorCard({ status }: { status: ReturnType<typeof useTotpStatus> }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = async (action: "setup" | "enable" | "disable") => {
    setErr(null);
    try {
      const r = await api<{ secret: string; otpauthUri: string; qrSvg: string }>("/api/auth/totp", { method: "POST", body: JSON.stringify(action === "setup" ? { action } : { action, code }) });
      if (action === "setup") setSetup(r);
      else {
        setSetup(null);
        setCode("");
        status.reload();
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  if (!status.known) return null;
  return (
    <Card title={`Two-factor authentication · ${status.enabled ? "on" : "off"}`} source="RFC 6238 TOTP (SHA-1, 30 s, 6 digits); secret stored AES-256-GCM encrypted; enable/disable audit-logged">
      <p className="mb-2 text-sm text-dim">
        {status.enabled
          ? "Topups, payouts, treasury policy changes and SOUL.md updates need your wallet signature and a 6-digit code."
          : "Add a 6-digit authenticator code on top of your wallet signature for topups, payouts, policy changes and SOUL.md updates."}
      </p>
      {!status.enabled && !setup && (
        <button onClick={() => run("setup")} className="rounded border border-accent px-3 py-1.5 text-sm text-accent">
          Set up 2FA
        </button>
      )}
      {setup && (
        <div className="space-y-2 text-xs text-dim">
          <div className="w-44 rounded bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
          <p>
            Scan with an authenticator app, or on this phone <a href={setup.otpauthUri} className="text-accent">open it in your authenticator</a>. Manual key:
          </p>
          <p className="break-all font-mono text-fg">{setup.secret}</p>
        </div>
      )}
      {(setup || status.enabled) && (
        <div className="mt-2 flex items-end gap-2">
          <TotpCodeInput value={code} onChange={setCode} what={setup ? "turning 2FA on" : "turning 2FA off"} />
          <button onClick={() => run(setup ? "enable" : "disable")} disabled={code.length !== 6} className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-40">
            {setup ? "Turn on" : "Turn off"}
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </Card>
  );
}
