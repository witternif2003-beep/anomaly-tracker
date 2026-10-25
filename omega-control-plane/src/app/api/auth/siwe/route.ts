import { z } from "zod";
import { parseSiweMessage } from "viem/siwe";
import { baseClient } from "@/lib/chain";
import { normalizeAddress } from "@/lib/address";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { consumeNonce, startSession } from "@/lib/session";

const Body = z.object({ message: z.string().max(4000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });

export const POST = handle(async (req: Request) => {
  const body = Body.safeParse(await readJson(req, 10_000));
  if (!body.success) throw new HttpError(400, "expected {message, signature}");
  const nonce = await consumeNonce();
  if (!nonce) throw new HttpError(401, "nonce missing or expired; request a new one");
  const host: string = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const parsed = parseSiweMessage(body.data.message);
  const valid = await baseClient().verifySiweMessage({
    message: body.data.message,
    signature: body.data.signature as `0x${string}`,
    domain: host,
    nonce,
  });
  if (!valid || !parsed.address) throw new HttpError(401, "SIWE verification failed");
  const address = normalizeAddress(parsed.address);
  const sql = await db();
  await sql`INSERT INTO users (eth_address, last_login_at) VALUES (${address}, now())
            ON CONFLICT (eth_address) DO UPDATE SET last_login_at = now()`;
  await appendAudit(sql, { actor: address, action: "login_siwe", details: { chainId: parsed.chainId ?? null, domain: host }, ipAddress: clientIp(req) });
  await startSession(address);
  return json({ address });
});
