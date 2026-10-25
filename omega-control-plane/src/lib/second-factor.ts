import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { HttpError, sessionSecret } from "./env";
import { verifyTotp } from "./totp";

const key = () => createHash("sha256").update(`omega-totp:${sessionSecret()}`).digest();

export function sealSecret(secretB32: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(secretB32, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function openSecret(sealed: string): string {
  const [iv, tag, enc] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function totpEnabled(sql: postgres.Sql, address: string): Promise<boolean> {
  const [row] = await sql<{ enabled: boolean }[]>`SELECT enabled FROM creator_totp WHERE address = ${address.toLowerCase()}`;
  return !!row?.enabled;
}

/**
 * Consumes a TOTP code for `address`. Each time step is accepted once (last_step only moves forward).
 * `pending` checks a not-yet-enabled secret (enrolment); otherwise it is a no-op for creators without 2FA.
 */
export async function checkSecondFactor(sql: postgres.Sql | postgres.TransactionSql, address: string, code: string | undefined, pending = false): Promise<void> {
  const [row] = await sql<{ secret_enc: string; enabled: boolean; last_step: string }[]>`
    SELECT secret_enc, enabled, last_step FROM creator_totp WHERE address = ${address.toLowerCase()}`;
  if (!row || row.enabled === pending) {
    if (pending) throw new HttpError(400, "start 2FA setup first");
    return;
  }
  if (!code) throw new HttpError(401, "2FA code required");
  const step = verifyTotp(openSecret(row.secret_enc), code);
  if (step === null) throw new HttpError(401, "invalid 2FA code");
  const used = await sql`
    UPDATE creator_totp SET last_step = ${step} WHERE address = ${address.toLowerCase()} AND last_step < ${step} RETURNING address`;
  if (!used.length) throw new HttpError(409, "2FA code already used; wait for the next code");
}
