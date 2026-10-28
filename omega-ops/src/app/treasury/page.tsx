import { LimitEditor } from "@/components/limit-editor";
import { Card, ErrorBox, RowsTable, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtTs, num, safe } from "@/lib/safe";
import { balance } from "@/lib/treasury";

export const dynamic = "force-dynamic";

export default async function Treasury() {
  const { data, error } = await safe(async () => {
    const sql = await db();
    const ledger = await sql<{ seq: string; at: Date; batch_id: string | null; kind: string; units: string; memo: string | null; actor: string | null }[]>`SELECT * FROM ops_treasury ORDER BY seq DESC LIMIT 100`;
    return { b: await balance(sql), ledger };
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-lg font-bold">SIMULATED TREASURY</h1>
        <p className="text-sm text-dim">Internal compute units charged per batch from bytes read. They have no monetary value and settle nowhere outside this platform. Spending limits are enforced before and after every batch.</p>
      </div>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="allocated" value={num(data.b.allocated, 2)} />
            <Stat label="spent" value={num(data.b.spent, 2)} />
            <Stat label="available" value={num(data.b.available, 2)} tone={data.b.available > 0 ? "good" : "bad"} />
            <Stat label="today / daily limit" value={`${num(data.b.spentToday, 2)} / ${num(data.b.dailyMax)}`} tone={data.b.dailyRemaining > 0 ? undefined : "bad"} hint={`per-batch limit ${num(data.b.batchMax)}`} />
          </div>
          <Card title="Spending limits (admin)">
            <LimitEditor batchMax={data.b.batchMax} dailyMax={data.b.dailyMax} />
          </Card>
          <Card title="Ledger">
            <RowsTable rows={data.ledger.map((r) => ({ seq: r.seq, at: fmtTs(r.at), kind: r.kind, units: num(r.units, 4), batch: r.batch_id ?? "—", memo: r.memo, actor: r.actor }))} />
          </Card>
        </>
      )}
    </div>
  );
}
