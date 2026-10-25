"use client";
import { useState } from "react";
import { useMe } from "@/components/auth";
import { Card, ErrorBox, RowsTable, Stat } from "@/components/ui";
import { api, useApi, when } from "@/lib/client";
import { buildCommandMessage } from "@/lib/command-message";
import { isPayoutAmount, PAYOUT_WALLET } from "@/lib/payout";
import { TOPUP_TIERS_USD } from "@/lib/survival";
import { connect, walletErrorText } from "@/lib/wallet";
import { TotpCodeInput, TwoFactorCard, useTotpStatus } from "@/components/totp";
import { useAgentAddress } from "../use-agent";

interface Policy {
  max_topup_usd: number;
  daily_topup_cap_usd: number;
  surplus_threshold_usd: number;
  updated_by: string | null;
  updated_at: string | null;
}

export default function Treasury() {
  const address = useAgentAddress();
  const { address: me } = useMe();
  const twoFa = useTotpStatus(me);
  const [totp, setTotp] = useState("");
  const status = useApi<{ agent?: { creator_address: string | null }; onchain: { usdcBalance: { value?: string; source: string } } }>(`/api/agents/${address}/status`);
  const pol = useApi<{ policy: Policy; payout: { wallet: string; inflightUsd: number; history: Record<string, unknown>[] } }>(`/api/agents/${address}/treasury`);
  const econ = useApi<{ topups: Record<string, unknown>[] }>(`/api/agents/${address}/economics`);
  const [edit, setP] = useState<{ base: Policy; value: Policy } | null>(null);
  const [amount, setAmount] = useState<number>(5);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutErr, setPayoutErr] = useState<string | null>(null);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);
  const p = edit && edit.base === pol.data?.policy ? edit.value : (pol.data?.policy ?? null);
  const creator = status.data?.agent?.creator_address;
  const isCreator = !!me && !!creator && me.toLowerCase() === creator.toLowerCase();

  const savePolicy = async () => {
    setErr(null);
    try {
      await api(`/api/agents/${address}/treasury`, {
        method: "PUT",
        body: JSON.stringify({ max_topup_usd: p!.max_topup_usd, daily_topup_cap_usd: p!.daily_topup_cap_usd, surplus_threshold_usd: p!.surplus_threshold_usd, totp: totp || undefined }),
      });
      setMsg("Policy saved (audit-logged).");
      pol.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const requestTopup = async () => {
    setErr(null);
    setMsg(null);
    try {
      const w = await connect();
      const message = buildCommandMessage({ agent: address, type: "topup", payload: { amountUsd: amount }, nonce: crypto.randomUUID(), issuedAt: new Date().toISOString() });
      const signature = await w.sign(message);
      const r = await api<{ commandId: string; note: string }>(`/api/agents/${address}/topup`, { method: "POST", body: JSON.stringify({ message, signature, totp: totp || undefined }) });
      setMsg(`Command #${r.commandId} queued. ${r.note}`);
      econ.reload();
    } catch (e) {
      setErr(walletErrorText(e));
    }
  };

  const usdc = status.data?.onchain.usdcBalance.value;
  const surplus = usdc != null && p ? Math.max(0, Number(usdc) - Number(p.surplus_threshold_usd) - (pol.data?.payout.inflightUsd ?? 0)) : null;

  const requestPayout = async () => {
    setPayoutErr(null);
    setPayoutMsg(null);
    const amountUsd = Number(payoutAmount);
    if (!isPayoutAmount(amountUsd)) return setPayoutErr("Enter a positive USD amount with at most 2 decimals.");
    try {
      const w = await connect();
      const message = buildCommandMessage({ agent: address, type: "payout", payload: { amountUsd, to: PAYOUT_WALLET }, nonce: crypto.randomUUID(), issuedAt: new Date().toISOString() });
      const signature = await w.sign(message);
      const r = await api<{ commandId: string; note: string }>(`/api/agents/${address}/payout`, { method: "POST", body: JSON.stringify({ message, signature, totp: totp || undefined }) });
      setPayoutMsg(`Command #${r.commandId} queued. ${r.note}`);
      pol.reload();
    } catch (e) {
      setPayoutErr(walletErrorText(e));
    }
  };

  const num = (k: keyof Policy) => (
    <label className="block text-xs text-dim">
      {k}
      <input
        type="number"
        min={0}
        value={p ? Number(p[k]) : 0}
        disabled={!isCreator}
        onChange={(e) => setP({ base: pol.data!.policy, value: { ...p!, [k]: Number(e.target.value) } })}
        className="mt-1 w-full rounded border border-line bg-bg px-2 py-1.5 font-mono text-fg"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <ErrorBox error={status.error ?? pol.error} />
      {isCreator && twoFa.enabled && <TotpCodeInput value={totp} onChange={setTotp} what="every policy change, topup and payout" />}
      <div className="rounded-md border border-line bg-panel p-3 text-xs text-dim">
        The control plane holds no keys and moves no funds. A topup or payout is a request signed by the creator wallet, checked against the policy below, and executed by the agent with its own wallet
        (automaton <span className="font-mono">topupCredits()</span> → x402 <span className="font-mono">/pay/&#123;usd&#125;/&#123;address&#125;</span>) when it next runs <span className="font-mono">omega-sync --apply</span>.
      </div>
      <Card title="Treasury policy" source={p?.updated_at ? `updated by ${p.updated_by} ${when(p.updated_at)}` : "defaults (not yet saved)"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {num("max_topup_usd")}
          {num("daily_topup_cap_usd")}
          {num("surplus_threshold_usd")}
        </div>
        {isCreator && (
          <button onClick={savePolicy} className="mt-3 rounded border border-accent px-3 py-1.5 text-sm text-accent">
            Save policy
          </button>
        )}
      </Card>
      <Card title="Request credit topup" source="Conway x402 topup tiers from automaton src/conway/topup.ts">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat label="Agent USDC (Base)" value={status.data?.onchain.usdcBalance.value ?? "—"} hint={status.data?.onchain.usdcBalance.source} />
          <Stat label="Max single topup" value={`$${p?.max_topup_usd ?? "—"}`} hint={`24 h cap $${p?.daily_topup_cap_usd ?? "—"}`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {TOPUP_TIERS_USD.map((t) => (
            <button key={t} onClick={() => setAmount(t)} className={`rounded border px-3 py-1.5 font-mono text-sm ${amount === t ? "border-accent text-accent" : "border-line text-dim"}`}>
              ${t}
            </button>
          ))}
        </div>
        {isCreator ? (
          <button onClick={requestTopup} className="mt-3 rounded bg-accent px-4 py-2 text-sm font-semibold text-bg">
            Sign topup request (${amount})
          </button>
        ) : (
          <p className="mt-3 text-xs text-dim">Only the creator wallet ({creator ?? "unknown until first snapshot"}) can request topups.</p>
        )}
        {msg && <p className="mt-2 text-xs text-good">{msg}</p>}
        <ErrorBox error={err} />
      </Card>
      <Card title="Payout to fixed wallet" source="USDC transfer on Base (ERC-20 transfer) signed and sent by the agent wallet">
        <div className="mb-3 rounded border border-line bg-bg p-2">
          <div className="text-[11px] uppercase tracking-wide text-dim">Payout wallet (hard-coded)</div>
          <a href={`https://basescan.org/address/${PAYOUT_WALLET}`} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-accent">
            {PAYOUT_WALLET}
          </a>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Stat label="Available surplus" value={surplus == null ? "—" : `$${surplus.toFixed(2)}`} hint={`USDC − $${p?.surplus_threshold_usd ?? "—"} reserve − $${pol.data?.payout.inflightUsd ?? 0} in flight`} />
          <Stat label="Reserve kept" value={`$${p?.surplus_threshold_usd ?? "—"}`} hint="surplus_threshold_usd" />
        </div>
        {isCreator ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-xs text-dim">
              amount (USD)
              <input
                inputMode="decimal"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value.trim())}
                placeholder="0.00"
                className="mt-1 w-32 rounded border border-line bg-bg px-2 py-1.5 font-mono text-fg"
              />
            </label>
            <button onClick={requestPayout} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg">
              Sign payout request
            </button>
          </div>
        ) : (
          <p className="text-xs text-dim">Only the creator wallet ({creator ?? "unknown until first snapshot"}) can request payouts.</p>
        )}
        <p className="mt-2 text-[11px] text-dim">
          The server rejects any destination other than this wallet and any amount above the surplus. The agent re-checks both before sending, and pays Base gas in ETH from its own wallet.
        </p>
        {payoutMsg && <p className="mt-2 text-xs text-good">{payoutMsg}</p>}
        <ErrorBox error={payoutErr} />
      </Card>
      <Card title="Payout history" source="control-plane agent_commands type=payout">
        <RowsTable rows={pol.data?.payout.history} columns={["id", "status", "payload", "created_by", "created_at", "updated_at", "result"]} empty="No payout requests." />
      </Card>
      <Card title="Topup history" source="control-plane agent_commands type=topup">
        <RowsTable rows={econ.data?.topups} columns={["id", "status", "payload", "created_by", "created_at", "updated_at", "result"]} empty="No topup requests." />
      </Card>
      {isCreator && <TwoFactorCard status={twoFa} />}
    </div>
  );
}
