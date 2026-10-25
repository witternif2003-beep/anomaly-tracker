import { randomBytes } from "node:crypto";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { sha256Hex } from "@/lib/hash";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { requireUser, startSession } from "@/lib/session";

/** One-time, short-lived link that signs another browser on this device (e.g. Safari) in as the same wallet. */
const HANDOFF_TTL_SEC = 120;

const Redeem = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

// Issue: requires a SIWE session. Only the SHA-256 of the token is stored.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const token = randomBytes(32).toString("base64url");
  const sql = await db();
  await sql`DELETE FROM login_handoffs WHERE expires_at < now() - interval '1 day'`;
  await sql`INSERT INTO login_handoffs (token_hash, address, expires_at)
            VALUES (${sha256Hex(token)}, ${user}, now() + make_interval(secs => ${HANDOFF_TTL_SEC}))`;
  await appendAudit(sql, { actor: user, action: "login_handoff_issued", details: { ttlSec: HANDOFF_TTL_SEC }, ipAddress: clientIp(req) });
  return json({ token, expiresInSec: HANDOFF_TTL_SEC });
});

// Redeem: single use, atomically marked used. POST (not GET) so link previews can't consume it.
export const PUT = handle(async (req: Request) => {
  const body = Redeem.safeParse(await readJson(req, 1_000));
  if (!body.success) throw new HttpError(400, "invalid sign-in link");
  const sql = await db();
  const [row] = await sql<{ address: string }[]>`
    UPDATE login_handoffs SET used_at = now()
    WHERE token_hash = ${sha256Hex(body.data.token)} AND used_at IS NULL AND expires_at > now()
    RETURNING address`;
  if (!row) throw new HttpError(401, "sign-in link expired or already used; copy a new one from the wallet browser");
  await appendAudit(sql, { actor: row.address, action: "login_handoff_redeemed", details: {}, ipAddress: clientIp(req) });
  await startSession(row.address);
  return json({ address: row.address });
});
