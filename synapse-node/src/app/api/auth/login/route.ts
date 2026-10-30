import { z } from "zod";
import { passphraseOk, startSession } from "@/lib/auth";
import { HttpError } from "@/lib/env";
import { handle, json, readJson } from "@/lib/http";

const Body = z.object({ passphrase: z.string().min(1).max(512), operator: z.string().trim().min(1).max(64).default("operator") });

export const POST = handle(async (req: Request) => {
  const { passphrase, operator } = Body.parse(await readJson(req, 10_000));
  if (!passphraseOk(passphrase)) {
    await new Promise((r) => setTimeout(r, 750));
    throw new HttpError(401, "passphrase rejected");
  }
  await startSession(operator);
  return json({ ok: true, actor: operator });
});
