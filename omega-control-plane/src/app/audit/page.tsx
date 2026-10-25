"use client";
import { Card, ErrorBox, RowsTable, Stat } from "@/components/ui";
import { useApi } from "@/lib/client";

interface Audit {
  database?: string;
  verification: null | { ok: boolean; checked: number; head: string; brokenAt: string | null };
  rows: Record<string, unknown>[];
}

export default function AuditPage() {
  const { data, error, reload } = useApi<Audit>("/api/audit");
  const v = data?.verification;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit chain</h1>
      <p className="text-sm text-dim">
        Append-only log; each record&apos;s hash = SHA-256(previous hash ‖ canonical JSON of the record). Postgres trigger rejects UPDATE/DELETE. Verification below is recomputed server-side on every load.
      </p>
      <ErrorBox error={error} />
      {v && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Chain" value={v.ok ? "verified" : "BROKEN"} tone={v.ok ? "good" : "bad"} hint={v.ok ? undefined : `first mismatch at seq ${v.brokenAt}`} />
          <Stat label="Records" value={v.checked} />
          <Stat label="Head hash" value={`${v.head.slice(0, 16)}…`} hint={v.head} />
          <div className="flex items-center">
            <button onClick={reload} className="rounded border border-line px-3 py-2 text-sm text-dim hover:text-fg">
              Re-verify
            </button>
          </div>
        </div>
      )}
      <Card title="Records (latest 300)" source="control-plane audit_log">
        <RowsTable rows={data?.rows} columns={["seq", "at", "actor", "agent_address", "action", "details", "ip_address", "hash"]} max={300} empty="No audit records yet." />
      </Card>
    </div>
  );
}
