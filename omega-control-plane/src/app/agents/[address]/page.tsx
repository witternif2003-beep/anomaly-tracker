"use client";
import { Card, Empty, ErrorBox, RowsTable, Stat, TierBadge } from "@/components/ui";
import { usd, useApi, when } from "@/lib/client";
import { useAgentAddress } from "./use-agent";

type F<T> = { value: T; source: string } | { error: string; source: string };
const val = <T,>(f?: F<T>) => (f && "value" in f ? f.value : undefined);
const err = <T,>(f?: F<T>) => (f && "error" in f ? f.error : undefined);

interface Status {
  registered: boolean;
  agent?: { name: string | null; creator_address: string | null; sandbox_id: string | null; added_by: string | null; created_at: string };
  snapshot: null | {
    id: string;
    capturedAt: string;
    receivedAt: string;
    payloadSha256: string;
    signature: string;
    survivalTier: string | null;
    creditsCents: number | null;
    creditsSource: string;
    agentState: string | null;
    turnCount: number;
    config: Record<string, string>;
    source: { tool: string; version: string };
    missingTables: string[];
    heartbeatSchedule: Record<string, unknown>[];
    heartbeatHistory: Record<string, unknown>[];
    children: Record<string, unknown>[];
    registry: Record<string, unknown>[];
    recentTurns: Record<string, unknown>[];
  };
  onchain: {
    blockNumber: F<string>;
    ethBalance: F<string>;
    usdcBalance: F<string>;
    erc8004IdentityTokens: F<string>;
    erc8004Agent?: { agentId: string; owner: F<string>; tokenUri: F<string>; reputationClients: F<number>; reputationSummary: F<{ count: string; value: string; decimals: number }> };
    readAt: string;
    rpc: string;
  };
}

function Field<T>({ label, f, fmt = (v: T) => String(v) }: { label: string; f?: F<T>; fmt?: (v: T) => string }) {
  const v = val(f);
  return <Stat label={label} value={v !== undefined ? fmt(v) : "error"} tone={v === undefined ? "bad" : undefined} hint={err(f) ? `${err(f)} · ${f?.source}` : f?.source} />;
}

export default function AgentOverview() {
  const address = useAgentAddress();
  const { data, error } = useApi<Status>(`/api/agents/${address}/status`);
  const s = data?.snapshot;
  const o = data?.onchain;
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {data && !s && <Empty>Registered, but no signed snapshot received yet. Run omega-sync on the agent host.</Empty>}
      {s && (
        <Card title={s.config?.name ?? "Agent state"} right={<TierBadge tier={s.survivalTier} />} source={`snapshot #${s.id} · sha256 ${s.payloadSha256.slice(0, 16)}… · signed by agent wallet (EIP-191) · ${s.source.tool} ${s.source.version}`}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Conway credits" value={usd(s.creditsCents)} hint={s.creditsSource} />
            <Stat label="Agent state" value={s.agentState ?? "—"} hint="kv agent_state" />
            <Stat label="Turns" value={s.turnCount} hint="COUNT(turns)" />
            <Stat label="Captured" value={when(s.capturedAt).split(" (")[0]} hint={when(s.capturedAt).split(" (")[1]?.replace(")", "")} />
            <Stat label="Creator" value={s.config?.creatorAddress ?? "—"} hint="automaton.json creatorAddress" />
            <Stat label="Model" value={s.config?.inferenceModel ?? "—"} hint="automaton.json inferenceModel" />
            <Stat label="Sandbox" value={s.config?.sandboxId ?? "—"} hint="automaton.json sandboxId" />
            <Stat label="Runtime" value={s.config?.version ?? "—"} hint="automaton.json version" />
          </div>
          {s.missingTables.length > 0 && <p className="mt-2 text-[11px] text-warn">tables absent in this state.db: {s.missingTables.join(", ")}</p>}
        </Card>
      )}
      {o && (
        <Card title="On-chain (Base mainnet, live)" source={`${o.rpc} · read ${when(o.readAt)}`}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Field label="USDC" f={o.usdcBalance} />
            <Field label="ETH" f={o.ethBalance} />
            <Field label="ERC-8004 identities" f={o.erc8004IdentityTokens} />
            <Field label="Block" f={o.blockNumber} />
          </div>
          {o.erc8004Agent && (
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Stat label="ERC-8004 agentId" value={o.erc8004Agent.agentId} hint="state.db registry.agent_id" />
              <Field label="Identity owner" f={o.erc8004Agent.owner} />
              <Field label="Reputation clients" f={o.erc8004Agent.reputationClients} />
              <Field label="Reputation summary" f={o.erc8004Agent.reputationSummary} fmt={(r) => `${r.value}${r.decimals ? `e-${r.decimals}` : ""} over ${r.count} feedback`} />
            </div>
          )}
        </Card>
      )}
      {s && (
        <>
          <Card title="Heartbeat schedule" source="state.db heartbeat_schedule">
            <RowsTable rows={s.heartbeatSchedule} columns={["task_name", "cron_expression", "enabled", "tier_minimum", "last_run_at", "last_result", "run_count", "fail_count", "last_error"]} />
          </Card>
          <Card title="Recent heartbeat runs" source="state.db heartbeat_history">
            <RowsTable rows={s.heartbeatHistory} columns={["task_name", "started_at", "result", "duration_ms", "error"]} max={20} />
          </Card>
          <Card title="Children (replication)" source="state.db children">
            <RowsTable rows={s.children} columns={["name", "address", "status", "funded_amount_cents", "sandbox_id", "created_at", "last_checked"]} empty="No child automatons spawned." />
          </Card>
          <Card title="Recent turns" source="state.db turns (latest 50, strings truncated at 2,000 chars)">
            <RowsTable rows={s.recentTurns} columns={["timestamp", "state", "input_source", "cost_cents", "thinking"]} max={15} />
          </Card>
        </>
      )}
    </div>
  );
}
