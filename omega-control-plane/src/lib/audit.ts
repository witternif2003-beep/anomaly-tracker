import type postgres from "postgres";
import { canonicalJson, sha256Hex } from "./hash";

export const GENESIS_HASH = "0".repeat(64);

export interface AuditInput {
  actor: string;
  agentAddress?: string | null;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export interface AuditRow {
  seq: string;
  at: Date;
  actor: string;
  agent_address: string | null;
  action: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  prev_hash: string;
  hash: string;
}

export function auditHash(prev: string, r: { at: string; actor: string; agentAddress: string | null; action: string; details: unknown; ipAddress: string | null }): string {
  return sha256Hex(
    prev +
      canonicalJson({
        at: r.at,
        actor: r.actor,
        agentAddress: r.agentAddress,
        action: r.action,
        details: r.details,
        ipAddress: r.ipAddress,
      }),
  );
}

/** Appends one record to the SHA-256 hash chain. Serialised by an advisory lock. */
export async function appendAudit(sql: postgres.Sql, input: AuditInput): Promise<{ seq: string; hash: string }> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(80040001)`;
    const [last] = await tx<{ hash: string }[]>`SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1`;
    const prev = last?.hash ?? GENESIS_HASH;
    const at = new Date().toISOString();
    const rec = {
      at,
      actor: input.actor,
      agentAddress: input.agentAddress ?? null,
      action: input.action,
      details: JSON.parse(JSON.stringify(input.details ?? {})),
      ipAddress: input.ipAddress ?? null,
    };
    const hash = auditHash(prev, rec);
    const [row] = await tx<{ seq: string }[]>`
      INSERT INTO audit_log (at, actor, agent_address, action, details, ip_address, prev_hash, hash)
      VALUES (${at}, ${rec.actor}, ${rec.agentAddress}, ${rec.action}, ${tx.json(rec.details)}, ${rec.ipAddress}, ${prev}, ${hash})
      RETURNING seq`;
    return { seq: String(row.seq), hash };
  }) as Promise<{ seq: string; hash: string }>;
}

export function verifyAuditRows(rows: AuditRow[]): { ok: boolean; checked: number; brokenAt: string | null; head: string } {
  let prev = GENESIS_HASH;
  for (const r of rows) {
    const expected = auditHash(prev, {
      at: new Date(r.at).toISOString(),
      actor: r.actor,
      agentAddress: r.agent_address,
      action: r.action,
      details: r.details,
      ipAddress: r.ip_address,
    });
    if (r.prev_hash !== prev || r.hash !== expected) {
      return { ok: false, checked: rows.length, brokenAt: String(r.seq), head: prev };
    }
    prev = r.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null, head: prev };
}
