import { generateSiweNonce } from "viem/siwe";
import { handle, json } from "@/lib/http";
import { issueNonce } from "@/lib/session";

export const GET = handle(async () => {
  const nonce = generateSiweNonce();
  await issueNonce(nonce);
  return json({ nonce });
});
