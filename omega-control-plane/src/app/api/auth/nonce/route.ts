import { randomBytes } from "node:crypto";
import { handle, json } from "@/lib/http";
import { issueNonce } from "@/lib/session";

export const GET = handle(async () => {
  // EIP-4361 nonce: 8+ alphanumerics. 128 bits as 32 hex chars, shorter than viem's 96-char default.
  const nonce = randomBytes(16).toString("hex");
  await issueNonce(nonce);
  return json({ nonce });
});
