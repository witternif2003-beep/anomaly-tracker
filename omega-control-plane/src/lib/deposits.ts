import { createPublicClient, formatUnits, getAddress, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";
import { CONTRACTS } from "./chain";

// mainnet.base.org rate-limits eth_getLogs ("request limit reached"); publicnode serves 10k-block ranges.
const LOGS_RPC = process.env.BASE_LOGS_RPC_URL ?? "https://base-rpc.publicnode.com";
const CHUNK = 10_000n;
/** Base produces a block every 2 s, so 43,200 blocks ≈ 24 h. */
export const LOOKBACK_BLOCKS = 43_200n;

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export interface Deposit {
  txHash: string;
  from: string;
  amountUsdc: string;
  blockNumber: string;
  at: string | null;
  explorer: string;
}

export interface TransferLog {
  transactionHash: string | null;
  blockNumber: bigint | null;
  args: { from?: Address; value?: bigint };
}

export function depositsFromLogs(logs: TransferLog[], blockTimes: Map<bigint, number>): Deposit[] {
  return logs
    .filter((l) => l.transactionHash && l.blockNumber != null && l.args.from && l.args.value != null)
    .map((l) => ({
      txHash: l.transactionHash!,
      from: getAddress(l.args.from!),
      amountUsdc: formatUnits(l.args.value!, 6),
      blockNumber: String(l.blockNumber),
      at: blockTimes.has(l.blockNumber!) ? new Date(blockTimes.get(l.blockNumber!)! * 1000).toISOString() : null,
      explorer: `https://basescan.org/tx/${l.transactionHash}`,
    }))
    .sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
}

export async function readUsdcDeposits(to: Address) {
  const client = createPublicClient({ chain: base, transport: http(LOGS_RPC, { timeout: 15_000, retryCount: 1 }) });
  const rpc = new URL(LOGS_RPC).host;
  const source = `USDC Transfer(to=${to}) logs @ ${CONTRACTS.usdc} via ${rpc}`;
  try {
    const head = await client.getBlockNumber();
    const start = head > LOOKBACK_BLOCKS ? head - LOOKBACK_BLOCKS : 0n;
    const ranges: [bigint, bigint][] = [];
    for (let f = start; f <= head; f += CHUNK) ranges.push([f, f + CHUNK - 1n > head ? head : f + CHUNK - 1n]);
    const chunks = await Promise.all(
      ranges.map(([fromBlock, toBlock]) => client.getLogs({ address: CONTRACTS.usdc, event: transfer, args: { to }, fromBlock, toBlock })),
    );
    const logs = chunks.flat();
    const blocks = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b != null))].slice(-25);
    const times = new Map<bigint, number>();
    await Promise.all(blocks.map(async (b) => times.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp))));
    return { source, fromBlock: String(start), toBlock: String(head), deposits: depositsFromLogs(logs, times).slice(0, 50) };
  } catch (e) {
    const msg = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    return { source, error: msg.slice(0, 200), deposits: [] as Deposit[] };
  }
}
