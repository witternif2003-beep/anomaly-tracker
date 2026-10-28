import { Card, ErrorBox, RowsTable, Stat } from "@/components/ui";
import { type AuditRow, verifyAuditRows } from "@/lib/audit";
import { db } from "@/lib/db";
import { fmtTs, safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function Audit() {
  const { data, error } = await safe(async () => {
    const sql = await db();
    const rows = Array.from(await sql<AuditRow[]>`SELECT * FROM ops_audit ORDER BY seq`);
    return { v: verifyAuditRows(rows), rows: rows.slice(-150).reverse() };
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-lg font-bold">SEALED AUDIT TRAIL</h1>
        <p className="text-sm text-dim">Every privileged action and batch outcome is appended with SHA-256 over the previous entry&apos;s hash. The chain is re-verified from genesis on each page load.</p>
      </div>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="chain" value={data.v.ok ? "intact" : `broken at #${data.v.brokenAt}`} tone={data.v.ok ? "good" : "bad"} />
            <Stat label="entries verified" value={data.v.checked} />
            <Stat label="head" value={<span className="break-all text-xs">{data.v.head.slice(0, 24)}…</span>} />
          </div>
          <Card title="Entries (newest first)">
            <RowsTable rows={data.rows.map((r) => ({ seq: r.seq, at: fmtTs(r.at), actor: r.actor, role: r.role ?? "—", action: r.action, subject: r.subject ?? "—", hash: r.hash.slice(0, 16) }))} max={150} />
          </Card>
        </>
      )}
    </div>
  );
}
