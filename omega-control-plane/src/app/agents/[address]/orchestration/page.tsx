"use client";
import { Card, Empty, ErrorBox, RowsTable } from "@/components/ui";
import { usd, useApi, when } from "@/lib/client";
import { useAgentAddress } from "../use-agent";

type Task = { id: string; goal_id: string; title: string; status: string; dependencies?: string; assigned_to?: string; agent_role?: string; actual_cost_cents?: number; priority?: number };

const STATUS_TONE: Record<string, string> = {
  completed: "border-good/60 text-good",
  running: "border-accent text-accent",
  assigned: "border-accent/50 text-accent",
  failed: "border-bad text-bad",
  blocked: "border-warn text-warn",
  cancelled: "border-line text-dim",
  pending: "border-line text-fg",
};

function levels(tasks: Task[]): Task[][] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  const deps = (t: Task): string[] => {
    try {
      const d = JSON.parse(t.dependencies ?? "[]");
      return Array.isArray(d) ? d.filter((x) => byId.has(x)) : [];
    } catch {
      return [];
    }
  };
  const visit = (t: Task, seen: Set<string>): number => {
    if (depth.has(t.id)) return depth.get(t.id)!;
    if (seen.has(t.id)) return 0;
    seen.add(t.id);
    const d = deps(t).reduce((m, id) => Math.max(m, visit(byId.get(id)!, seen) + 1), 0);
    depth.set(t.id, d);
    return d;
  };
  tasks.forEach((t) => visit(t, new Set()));
  const out: Task[][] = [];
  tasks.forEach((t) => (out[depth.get(t.id)!] ??= []).push(t));
  return out.filter(Boolean);
}

export default function Orchestration() {
  const address = useAgentAddress();
  const { data, error } = useApi<{ goals: Record<string, unknown>[]; tasks: Task[]; lastTick: unknown; capturedAt: string | null; source: string }>(`/api/agents/${address}/orchestration`);
  const goals = data?.goals ?? [];
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <Card title="Orchestrator last tick" source="state.db kv orchestrator.last_tick">
        {data?.lastTick ? <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs">{JSON.stringify(data.lastTick, null, 2)}</pre> : <Empty>No orchestrator tick recorded.</Empty>}
      </Card>
      {goals.length === 0 && data && <Empty>No goals in the latest snapshot ({when(data.capturedAt)}).</Empty>}
      {goals.map((g) => {
        const tasks = (data?.tasks ?? []).filter((t) => t.goal_id === g.id);
        return (
          <Card key={String(g.id)} title={String(g.title)} right={<span className="font-mono text-xs text-dim">{String(g.status)}</span>} source="state.db goals + task_graph (dependency levels from task_graph.dependencies)">
            <p className="mb-3 text-xs text-dim">
              {String(g.description ?? "")} · revenue {usd(g.actual_revenue_cents as number)} actual
            </p>
            {tasks.length === 0 ? (
              <Empty>No tasks in snapshot for this goal.</Empty>
            ) : (
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
                {levels(tasks).map((lvl, i) => (
                  <div key={i} className="flex min-w-52 flex-col gap-2">
                    <div className="text-[11px] uppercase text-dim">level {i}</div>
                    {lvl.map((t) => (
                      <div key={t.id} className={`rounded border bg-bg/60 p-2 text-xs ${STATUS_TONE[t.status] ?? "border-line"}`}>
                        <div className="font-semibold text-fg">{t.title}</div>
                        <div className="mt-1 font-mono">{t.status}</div>
                        <div className="mt-1 text-dim">{t.agent_role ?? "—"} · {usd(t.actual_cost_cents ?? 0)}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      <Card title="All tasks" source="state.db task_graph (latest 50)">
        <RowsTable rows={data?.tasks as Record<string, unknown>[] | undefined} columns={["title", "status", "goal_id", "assigned_to", "agent_role", "priority", "retry_count", "actual_cost_cents", "created_at"]} />
      </Card>
    </div>
  );
}
