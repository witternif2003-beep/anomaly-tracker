import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { passphraseOk, startSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";

const Body = z.object({ passphrase: z.string().min(1), operator: z.string().trim().min(1).max(64).default("operator") });

export const POST = handle(async (req: Request) => {
  const { passphrase, operator } = Body.parse(await readJson(req));
  const sql = await db();
  if (!passphraseOk(passphrase)) {
    await appendAudit(sql, { actor: operator, action: "auth.denied", ipAddress: clientIp(req) });
    throw new HttpError(401, "passphrase rejected");
  }
  await startSession(operator, "admin");
  await appendAudit(sql, { actor: operator, role: "admin", action: "auth.session_started", ipAddress: clientIp(req) });
  return json({ ok: true, actor: operator, role: "admin" });
});
