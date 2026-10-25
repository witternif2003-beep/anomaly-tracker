// Fixed payout destination, set by the operator. Shared by server, browser and agent/omega-sync.mts.
// Every payout command must name exactly this address; the server and the agent both refuse any other.
export const PAYOUT_WALLET = "0x4D11f9f5bB127D4c2e971c2e62b93CAF957b7F0d" as const;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export function isPayoutAmount(v: unknown): v is number {
  return typeof v === "number" && v > 0 && v <= 1_000_000 && /^\d+(\.\d{1,2})?$/.test(String(v));
}

/** USD amount (≤ 2 decimals) to USDC base units (6 decimals) without float error. */
export function usdcUnits(amountUsd: number): bigint {
  const [whole, frac = ""] = String(amountUsd).split(".");
  return BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
}
