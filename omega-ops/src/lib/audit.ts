import type postgres from "postgres";
import { canonicalJson, sha256Hex } from "./hash";

export const GENESIS_HASH = "0".repeat(64);

export interface AuditInput {
  actor: string;
  role?: string | null;
  action: string;
  subject?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export interface AuditRow {
  seq: string;
  at: Date;
  actor: string;
  role: string | null;
  action: string;
  subject: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  prev_hash: string;
  hash: string;
}

type Rec = { at: string; actor: string; role: string | null; action: string; subject: string | null; details: unknown; ipAddress: string | null };

export function auditHash(prev: string, r: Rec): string {
  return sha256Hex(prev + canonicalJson(r));
}

/** Appends one record to the SHA-256 hash chain, serialised by an advisory lock. */
export async function appendAudit(sql: postgres.Sql | postgres.TransactionSql, input: AuditInput): Promise<{ seq: string; hash: string }> {
  const run = async (tx: postgres.TransactionSql) => {
    await tx`SELECT pg_advisory_xact_lock(80050001)`;
    const [last] = await tx<{ hash: string }[]>`SELECT hash FROM ops_audit ORDER BY seq DESC LIMIT 1`;
    const prev = last?.hash ?? GENESIS_HASH;
    const rec: Rec = {
      at: new Date().toISOString(),
      actor: input.actor,
      role: input.role ?? null,
      action: input.action,
      subject: input.subject ?? null,
      details: JSON.parse(JSON.stringify(input.details ?? {})),
      ipAddress: input.ipAddress ?? null,
    };
    const hash = auditHash(prev, rec);
    const [row] = await tx<{ seq: string }[]>`
      INSERT INTO ops_audit (at, actor, role, action, subject, details, ip_address, prev_hash, hash)
      VALUES (${rec.at}, ${rec.actor}, ${rec.role}, ${rec.action}, ${rec.subject}, ${tx.json(rec.details as postgres.JSONValue)}, ${rec.ipAddress}, ${prev}, ${hash})
      RETURNING seq`;
    return { seq: String(row.seq), hash };
  };
  if ("savepoint" in sql) return run(sql as postgres.TransactionSql);
  return (sql as postgres.Sql).begin(run) as Promise<{ seq: string; hash: string }>;
}

export function verifyAuditRows(rows: AuditRow[]): { ok: boolean; checked: number; brokenAt: string | null; head: string } {
  let prev = GENESIS_HASH;
  for (const r of rows) {
    const expected = auditHash(prev, {
      at: new Date(r.at).toISOString(),
      actor: r.actor,
      role: r.role,
      action: r.action,
      subject: r.subject,
      details: r.details,
      ipAddress: r.ip_address,
    });
    if (r.prev_hash !== prev || r.hash !== expected) return { ok: false, checked: rows.length, brokenAt: String(r.seq), head: prev };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null, head: prev };
}
