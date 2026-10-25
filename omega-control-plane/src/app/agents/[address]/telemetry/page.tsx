"use client";
import { useEffect, useState } from "react";
import { Bars, Card, Empty, ErrorBox, RowsTable, TierBadge } from "@/components/ui";
import { usd, useApi, when } from "@/lib/client";
import { useAgentAddress } from "../use-agent";

interface Live {
  id: string;
  captured_at: string;
  survival_tier: string | null;
  credits_cents: string | null;
  turn_count: string | null;
  agent_state: string | null;
  last_turn: Record<string, unknown> | null;
  last_tool_call: Record<string, unknown> | null;
  last_heartbeat: Record<string, unknown> | null;
}

export default function Telemetry() {
  const address = useAgentAddress();
  const [live, setLive] = useState<Live | null>(null);
  const [conn, setConn] = useState<"connecting" | "open" | "reconnecting">("connecting");
  const [lastPing, setLastPing] = useState<string | null>(null);
  const status = useApi<{ snapshot: { recentToolCalls: Record<string, unknown>[]; policyDecisions: Record<string, unknown>[] } | null }>(`/api/agents/${address}/status`);
  const mem = useApi<{ snapshotId: string | null }>(`/api/agents/${address}/memory`);

  useEffect(() => {
    const es = new EventSource(`/api/agents/${address}/telemetry`);
    es.addEventListener("hello", () => setConn("open"));
    es.addEventListener("snapshot", (e) => setLive(JSON.parse((e as MessageEvent).data)));
    es.addEventListener("ping", (e) => setLastPing(JSON.parse((e as MessageEvent).data).at));
    es.onerror = () => setConn("reconnecting");
    return () => es.close();
  }, [address]);

  const calls = status.data?.snapshot?.recentToolCalls ?? [];
  const byName = Object.values(
    calls.reduce<Record<string, { name: string; n: number }>>((acc, c) => {
      const n = String(c.name);
      (acc[n] ??= { name: n, n: 0 }).n++;
      return acc;
    }, {}),
  ).sort((a, b) => b.n - a.n);

  return (
    <div className="space-y-4">
      <ErrorBox error={status.error ?? mem.error} />
      <Card
        title="Live stream"
        right={<span className={`font-mono text-xs ${conn === "open" ? "text-good" : "text-warn"}`}>SSE {conn}</span>}
        source="GET /api/agents/:address/telemetry (server-sent events, polls Postgres every 5 s for new agent-signed snapshots)"
      >
        {!live ? (
          <Empty>Waiting for a snapshot… {lastPing && `last ping ${when(lastPing)}`}</Empty>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <TierBadge tier={live.survival_tier} />
              <span className="font-mono">{usd(live.credits_cents)}</span>
              <span className="font-mono text-dim">turns {live.turn_count}</span>
              <span className="font-mono text-dim">state {live.agent_state ?? "—"}</span>
              <span className="text-xs text-dim">snapshot #{live.id} · {when(live.captured_at)}</span>
            </div>
            {[["last turn", live.last_turn], ["last tool call", live.last_tool_call], ["last heartbeat", live.last_heartbeat]].map(([k, v]) => (
              <div key={k as string}>
                <div className="text-[11px] uppercase text-dim">{k as string}</div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-bg/60 p-2 font-mono text-[11px]">{v ? JSON.stringify(v, null, 2) : "—"}</pre>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Tool calls by name (latest 50 calls)" source="state.db tool_calls">
        <Bars data={byName} label="name" value="n" />
      </Card>
      <Card title="Recent tool calls" source="state.db tool_calls (latest 50)">
        <RowsTable rows={calls} columns={["created_at", "name", "duration_ms", "error", "arguments", "result"]} max={25} />
      </Card>
      <Card title="Policy decisions" source="state.db policy_decisions (latest 50)">
        <RowsTable rows={status.data?.snapshot?.policyDecisions} columns={["created_at", "tool_name", "risk_level", "decision", "rules_triggered", "reason", "latency_ms"]} max={25} />
      </Card>
    </div>
  );
}
