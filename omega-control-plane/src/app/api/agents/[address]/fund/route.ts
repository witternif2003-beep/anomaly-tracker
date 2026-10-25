import QRCode from "qrcode";
import { normalizeAddress, sameAddress } from "@/lib/address";
import { getAgent, latestSnapshot } from "@/lib/agents";
import { CONTRACTS, readOnchain } from "@/lib/chain";
import { db } from "@/lib/db";
import { LOOKBACK_BLOCKS, readUsdcDeposits } from "@/lib/deposits";
import { handle, json } from "@/lib/http";
import { PAYOUT_WALLET } from "@/lib/payout";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/fund">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const address = agent.address as `0x${string}`;
  const [snap, onchain, deposits, qrSvg] = await Promise.all([
    latestSnapshot(sql, address),
    readOnchain(address),
    readUsdcDeposits(address),
    QRCode.toString(address, { type: "svg", margin: 1 }),
  ]);
  return json({
    address,
    chainId: 8453,
    usdc: CONTRACTS.usdc,
    qrSvg,
    isPayoutWallet: sameAddress(address, PAYOUT_WALLET),
    hasSnapshot: snap != null,
    creditsCents: snap?.credits_cents == null ? null : Number(snap.credits_cents),
    survivalTier: snap?.survival_tier ?? null,
    balances: { usdc: onchain.usdcBalance, eth: onchain.ethBalance, readAt: onchain.readAt },
    deposits: { ...deposits, lookbackBlocks: Number(LOOKBACK_BLOCKS) },
  });
});
