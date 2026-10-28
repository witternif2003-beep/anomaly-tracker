import { endSession, principal } from "@/lib/auth";
import { db } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { clientIp, handle, json } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const p = await principal(req);
  if (p.via === "session") {
    const sql = await db();
    await appendAudit(sql, { actor: p.actor, role: p.role, action: "auth.session_ended", ipAddress: clientIp(req) });
  }
  await endSession();
  return json({ ok: true });
});
