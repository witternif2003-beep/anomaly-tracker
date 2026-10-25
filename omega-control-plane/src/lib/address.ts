import { getAddress, isAddress } from "viem";
import { HttpError } from "./env";

export function normalizeAddress(input: string): `0x${string}` {
  if (!isAddress(input, { strict: false })) throw new HttpError(400, "invalid address");
  return getAddress(input);
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
