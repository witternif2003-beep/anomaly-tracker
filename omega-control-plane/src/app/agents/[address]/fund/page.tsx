"use client";
import { useEffect, useState } from "react";
import { Card, Empty, ErrorBox, RowsTable, Stat } from "@/components/ui";
import { usd, useApi, when } from "@/lib/client";
import { isPayoutAmount, usdcUnits } from "@/lib/payout";
import { hasWallet, sendUsdcOnBase, walletErrorText } from "@/lib/wallet";
import { useAgentAddress } from "../use-agent";

type Field = { value: string; source: string } | { error: string; source: string };
interface Fund {
  address: `0x${string}`;
  chainId: number;
  usdc: `0x${string}`;
  qrSvg: string;
  isPayoutWallet: boolean;
  hasSnapshot: boolean;
  creditsCents: number | null;
  survivalTier: string | null;
  balances: { usdc: Field; eth: Field; readAt: string };
  deposits: {
    source: string;
    fromBlock?: string;
    toBlock?: string;
    lookbackBlocks: number;
    error?: string;
    deposits: { txHash: string; from: string; amountUsdc: string; blockNumber: string; at: string | null; explorer: string }[];
  };
}

const val = (f?: Field) => (!f ? "—" : "value" in f ? f.value : "read failed");

export default function FundPage() {
  const address = useAgentAddress();
  const { data, error, reload } = useApi<Fund>(`/api/agents/${address}/fund`);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("5");
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string; hash?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(reload, 20_000);
    return () => clearInterval(t);
  }, [reload]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the deposit address:", address);
    }
  };

  const send = async () => {
    if (!data) return;
    const n = Number(amount);
    if (!isPayoutAmount(n)) return setSendMsg({ ok: false, text: "Enter a positive USDC amount with at most 2 decimals." });
    setBusy(true);
    setSendMsg(null);
    try {
      const hash = await sendUsdcOnBase(data.usdc, data.address, usdcUnits(n));
      setSendMsg({ ok: true, text: "Sent to the network. It appears under deposits once Base includes it.", hash });
      setTimeout(reload, 6000);
    } catch (e) {
      setSendMsg({ ok: false, text: walletErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {data?.isPayoutWallet && (
        <div className="rounded border border-warn/50 p-3 text-sm text-warn">
          This is the fixed payout wallet, not an automaton. Money sent here does not fund any agent. Fund the automaton&apos;s own wallet
          (walletAddress in ~/.automaton/automaton.json) after registering it on Fleet.
        </div>
      )}
      <Card title="Deposit address (USDC on Base)" source="agent wallet address as registered on Fleet · chain ID 8453">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {data && <div className="w-44 shrink-0 rounded bg-white p-2" dangerouslySetInnerHTML={{ __html: data.qrSvg }} />}
          <div className="min-w-0 space-y-2">
            <p className="break-all font-mono text-sm">{address}</p>
            <button onClick={copy} className="rounded border border-line px-3 py-1 text-xs text-dim hover:text-fg">
              {copied ? "Copied" : "Copy address"}
            </button>
            <p className="text-xs text-dim">
              Send only USDC (contract <span className="break-all font-mono">{data?.usdc ?? "…"}</span>) or ETH on the <b>Base</b> network. Tokens sent on
              another network do not arrive here.
            </p>
            <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noreferrer" className="text-xs text-accent">
              View on BaseScan
            </a>
          </div>
        </div>
      </Card>
      <Card title="Send USDC from your wallet" source="ERC-20 transfer() on Base, signed and broadcast by your wallet; the control plane never holds keys">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-dim" htmlFor="amt">
            Amount (USDC)
          </label>
          <input
            id="amt"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded border border-line bg-bg px-2 py-1 font-mono text-sm"
          />
          <button disabled={busy || !data} onClick={send} className="rounded bg-accent px-3 py-1 text-sm font-semibold text-bg disabled:opacity-50">
            {busy ? "Waiting for wallet…" : "Send with wallet"}
          </button>
        </div>
        {!hasWallet() && <p className="mt-2 text-xs text-dim">No wallet in this browser: open this page in Phantom, or scan the QR code from any wallet.</p>}
        {sendMsg && (
          <p className={`mt-2 text-sm ${sendMsg.ok ? "text-good" : "text-bad"}`}>
            {sendMsg.text}{" "}
            {sendMsg.hash && (
              <a href={`https://basescan.org/tx/${sendMsg.hash}`} target="_blank" rel="noreferrer" className="break-all font-mono text-accent">
                {sendMsg.hash}
              </a>
            )}
          </p>
        )}
      </Card>
      <Card title="Live balances" source={data ? `${data.balances.usdc.source} · ${data.balances.eth.source} · read ${when(data.balances.readAt)} · refreshes every 20 s` : undefined}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="USDC (on-chain)" value={val(data?.balances.usdc)} />
          <Stat label="ETH (gas)" value={val(data?.balances.eth)} />
          <Stat label="Conway credits" value={data?.creditsCents == null ? "—" : usd(data.creditsCents)} hint={data?.hasSnapshot ? "latest signed snapshot" : "no signed snapshot yet"} />
          <Stat label="Survival tier" value={data?.survivalTier ?? "—"} hint={data?.hasSnapshot ? "latest signed snapshot" : "no signed snapshot yet"} />
        </div>
      </Card>
      <Card
        title="Recent USDC deposits"
        source={data ? `${data.deposits.source} · blocks ${data.deposits.fromBlock ?? "?"}–${data.deposits.toBlock ?? "?"} (last ${data.deposits.lookbackBlocks.toLocaleString()} blocks ≈ 24 h)` : undefined}
      >
        {data?.deposits.error ? (
          <p className="text-sm text-bad">Could not read deposits: {data.deposits.error}</p>
        ) : !data || data.deposits.deposits.length === 0 ? (
          <Empty>No USDC deposits to this address in the last ~24 h.</Empty>
        ) : (
          <RowsTable rows={data.deposits.deposits.map((d) => ({ at: d.at ? when(d.at) : `block ${d.blockNumber}`, amount: `${d.amountUsdc} USDC`, from: d.from, tx: d.txHash }))} />
        )}
      </Card>
    </div>
  );
}
