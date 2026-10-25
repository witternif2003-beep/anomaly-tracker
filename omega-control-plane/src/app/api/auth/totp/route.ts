import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { checkSecondFactor, sealSecret, totpEnabled } from "@/lib/second-factor";
import { requireUser } from "@/lib/session";
import { base32Encode, otpauthUri } from "@/lib/totp";

export const GET = handle(async () => {
  const user = await requireUser();
  return json({ enabled: await totpEnabled(await db(), user) });
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("disable"), code: z.string().regex(/^\d{6}$/) }),
]);

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = Body.safeParse(await readJson(req, 2_000));
  if (!body.success) throw new HttpError(400, "expected {action: setup|enable|disable, code?}");
  const sql = await db();
  const addr = user.toLowerCase();
  const audit = (action: string) => appendAudit(sql, { actor: user, agentAddress: null, action, details: {}, ipAddress: clientIp(req) });

  if (body.data.action === "setup") {
    if (await totpEnabled(sql, user)) throw new HttpError(409, "2FA is already on; turn it off first to re-enrol");
    const secret = base32Encode(randomBytes(20));
    await sql`
      INSERT INTO creator_totp (address, secret_enc, enabled, last_step) VALUES (${addr}, ${sealSecret(secret)}, false, 0)
      ON CONFLICT (address) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, enabled = false, last_step = 0, created_at = now(), enabled_at = NULL`;
    const uri = otpauthUri(secret, user);
    return json({ secret, otpauthUri: uri, qrSvg: await QRCode.toString(uri, { type: "svg", margin: 1 }) });
  }
  if (body.data.action === "enable") {
    await checkSecondFactor(sql, user, body.data.code, true);
    await sql`UPDATE creator_totp SET enabled = true, enabled_at = now() WHERE address = ${addr}`;
    await audit("totp_enabled");
    return json({ enabled: true });
  }
  if (!(await totpEnabled(sql, user))) throw new HttpError(400, "2FA is not on");
  await checkSecondFactor(sql, user, body.data.code);
  await sql`DELETE FROM creator_totp WHERE address = ${addr}`;
  await audit("totp_disabled");
  return json({ enabled: false });
});
