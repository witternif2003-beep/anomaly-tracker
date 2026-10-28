import { randomBytes } from "node:crypto";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { hashApiKey, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ name: z.string().trim().min(1).max(64), role: z.enum(["viewer", "operator"]).default("viewer") });

export const GET = handle(async (req: Request) => {
  await requireRole(req, "admin");
  const sql = await db();
  const keys = await sql`SELECT id, name, role, created_at, created_by, last_used_at, revoked_at FROM ops_api_key ORDER BY id DESC`;
  return json({ keys });
});

export const POST = handle(async (req: Request) => {
  const p = await requireRole(req, "admin");
  const { name, role } = Body.parse(await readJson(req));
  const secret = `oops_${randomBytes(24).toString("base64url")}`;
  const sql = await db();
  const [row] = await sql`
    INSERT INTO ops_api_key (name, key_hash, role, created_by) VALUES (${name}, ${hashApiKey(secret)}, ${role}, ${p.actor}) RETURNING id, name, role`;
  await appendAudit(sql, { actor: p.actor, role: p.role, action: "key.created", subject: `key:${row.id}`, details: { name, role }, ipAddress: clientIp(req) });
  return json({ key: row, secret, note: "stored as a SHA-256 digest; this is the only time the token is shown" }, { status: 201 });
});

export const DELETE = handle(async (req: Request) => {
  const p = await requireRole(req, "admin");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "id is required");
  const sql = await db();
  const [row] = await sql`UPDATE ops_api_key SET revoked_at = now() WHERE id = ${id} AND revoked_at IS NULL RETURNING id, name`;
  if (!row) throw new HttpError(404, "no such active key");
  await appendAudit(sql, { actor: p.actor, role: p.role, action: "key.revoked", subject: `key:${id}`, ipAddress: clientIp(req) });
  return json({ revoked: row });
});
