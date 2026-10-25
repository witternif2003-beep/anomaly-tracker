"use client";
import Link from "next/link";
import { useState } from "react";
import { useMe } from "@/components/auth";
import { Card, Empty, ErrorBox, RowsTable, TierBadge } from "@/components/ui";
import { api, short, usd, useApi, when } from "@/lib/client";

interface AgentSummary {
  address: string;
  name: string | null;
  creator_address: string | null;
  last_snapshot_at: string | null;
  survival_tier: string | null;
  credits_cents: string | null;
  turn_count: string | null;
  agent_state: string | null;
  credits_source: string | null;
}

export default function FleetPage() {
  const { address: me } = useMe();
  const fleet = useApi<{ agents: AgentSummary[]; database: string }>("/api/agents");
  const health = useApi<{ status: string; database: string; sessionSecret: string; baseRpc: string }>("/api/health");
  const pricing = useApi<{ source: string; pricing: Record<string, unknown>[]; error?: string }>("/api/conway/pricing");
  const [addr, setAddr] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    setErr(null);
    try {
      await api("/api/agents", { method: "POST", body: JSON.stringify({ address: addr.trim(), name: name.trim() || undefined }) });
      setAddr("");
      setName("");
      fleet.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Fleet command center</h1>
        <p className="mt-1 text-sm text-dim">
          Conway Automaton agents registered with this control plane. Every number below comes from an agent-signed snapshot or a live Base read.
        </p>
      </div>

      {health.data && (health.data.database !== "ok" || health.data.sessionSecret !== "configured") && (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          Server setup incomplete: database {health.data.database}, SESSION_SECRET {health.data.sessionSecret}.
        </div>
      )}

      <Card title={`Agents (${fleet.data?.agents.length ?? 0})`} source="control-plane Postgres · latest agent-signed snapshot per agent">
        <ErrorBox error={fleet.error} />
        {fleet.data && fleet.data.agents.length === 0 && <Empty>No agents yet. Sign in, add an agent wallet below, then run omega-sync on the agent host (see Connect).</Empty>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fleet.data?.agents.map((a) => (
            <Link key={a.address} href={`/agents/${a.address}`} className="block rounded-md border border-line bg-bg/50 p-3 hover:border-accent/60">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{a.name ?? "unnamed agent"}</span>
                <span className="ml-auto">
                  <TierBadge tier={a.survival_tier} />
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-dim">{a.address}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-dim">credits</div>
                  <div className="font-mono">{usd(a.credits_cents)}</div>
                </div>
                <div>
                  <div className="text-dim">turns</div>
                  <div className="font-mono">{a.turn_count ?? "—"}</div>
                </div>
                <div>
                  <div className="text-dim">state</div>
                  <div className="font-mono">{a.agent_state ?? "—"}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-dim">last snapshot {when(a.last_snapshot_at)}</div>
              <div className="text-[11px] text-dim">creator {short(a.creator_address)}</div>
            </Link>
          ))}
        </div>
      </Card>

      <Card title="Register an agent" source="POST /api/agents (SIWE session required, audit-logged)">
        {!me ? (
          <Empty>Sign in with Ethereum to register agents.</Empty>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Agent wallet 0x…" className="flex-1 rounded border border-line bg-bg px-3 py-2 font-mono" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Label (optional)" className="rounded border border-line bg-bg px-3 py-2 sm:w-48" />
            <button onClick={add} className="rounded bg-accent px-4 py-2 font-semibold text-bg">
              Add
            </button>
          </div>
        )}
        <ErrorBox error={err} />
      </Card>

      <Card title="Conway Cloud sandbox pricing" source={pricing.data?.source ?? "api.conway.tech/v1/credits/pricing"}>
        <ErrorBox error={pricing.error ?? pricing.data?.error ?? null} />
        {pricing.data?.pricing && (
          <RowsTable
            rows={pricing.data.pricing.map((p) => ({ ...p, per_month: usd(p.cents_per_month as number) }))}
            columns={["name", "vcpu", "memory_mb", "disk_gb", "per_month"]}
          />
        )}
      </Card>
    </div>
  );
}
