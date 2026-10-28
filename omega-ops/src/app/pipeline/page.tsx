import { AutoRefresh } from "@/components/refresh";
import { Card, ErrorBox } from "@/components/ui";
import { db } from "@/lib/db";
import { batchLabel } from "@/lib/narrative";
import { DAG } from "@/lib/pipeline";
import { num, safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

const LAYERS = (() => {
  const depth: Record<string, number> = {};
  for (const s of DAG) depth[s.name] = s.dependsOn.length ? Math.max(...s.dependsOn.map((d) => depth[d])) + 1 : 0;
  const out: (typeof DAG)[] = [];
  for (const s of DAG) (out[depth[s.name]] ??= []).push(s);
  return out;
})();

export default async function Pipeline() {
  const { data, error } = await safe(async () => {
    const sql = await db();
    const [last] = await sql<{ id: string }[]>`SELECT id FROM ops_batch ORDER BY id DESC LIMIT 1`;
    const stages = last ? await sql<{ name: string; status: string; duration_ms: number | null; rows_out: number | null; bytes: string | null }[]>`SELECT name, status, duration_ms, rows_out, bytes FROM ops_stage WHERE batch_id = ${last.id}` : [];
    return { last, stages: Object.fromEntries(stages.map((s) => [s.name, s])) };
  });
  const tone = (st?: string) => (st === "ok" ? "border-good/60" : st === "failed" ? "border-bad/70" : st === "degraded" ? "border-warn/70" : st === "running" ? "border-warn/70" : "border-line");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold">ORCHESTRATION GRAPH</h1>
          <p className="text-sm text-dim">The nine-stage batch DAG, coloured by the most recent run{data?.last ? ` (${batchLabel(data.last.id)})` : ""}.</p>
        </div>
        <AutoRefresh seconds={15} />
      </div>
      <ErrorBox error={error} />
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
        {LAYERS.map((layer, i) => (
          <div key={i} className="flex flex-1 flex-col justify-center gap-3">
            {layer.map((s) => {
              const run = data?.stages[s.name];
              return (
                <div key={s.name} className={`rounded-lg border-2 bg-panel p-3 font-mono text-xs ${tone(run?.status)}`}>
                  <div className="font-bold text-accent">{s.name}</div>
                  <div className="text-[11px] text-dim">{s.detail}</div>
                  <div className="mt-1 text-[11px]">{run ? `${run.status} · ${num(run.duration_ms)} ms · ${num(run.rows_out)} rows` : "not run"}</div>
                  {s.dependsOn.length > 0 && <div className="mt-1 text-[10px] text-dim">after {s.dependsOn.join(", ")}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <Card title="Agent fleet">
        <p className="text-sm text-dim">Each stage runs as a bounded worker inside the batch process: it receives only the previous stage&apos;s output, records its own timing, memory and I/O, and halts the graph on failure so downstream stages never run on partial input.</p>
      </Card>
    </div>
  );
}
