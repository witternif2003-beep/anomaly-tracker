import { createPublicClient, formatUnits, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { env } from "./env";

// Addresses from Conway-Research/automaton v0.2.1 src/conway/x402.ts and src/registry/erc8004.ts,
// confirmed on Base mainnet (proxy contracts report getVersion() = "2.0.0").
export const CONTRACTS = {
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  erc8004Identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  erc8004Reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
} as const satisfies Record<string, Address>;

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const identityAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);
// ERC-8004 v2 reputation registry (the automaton v0.2.1 getFeedback() ABI reverts on the deployed contract).
const reputationAbi = parseAbi([
  "function getClients(uint256 agentId) view returns (address[])",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
]);

export async function readUsdcUnits(address: Address): Promise<bigint> {
  return await baseClient().readContract({ address: CONTRACTS.usdc, abi: erc20, functionName: "balanceOf", args: [address] });
}

const makeClient = () => createPublicClient({ chain: base, transport: http(env.baseRpcUrl, { timeout: 8000, retryCount: 1 }) });
let client: ReturnType<typeof makeClient> | undefined;
export function baseClient(): ReturnType<typeof makeClient> {
  client ??= makeClient();
  return client;
}

type Field<T> = { value: T; source: string } | { error: string; source: string };

async function field<T>(source: string, fn: () => Promise<T>): Promise<Field<T>> {
  try {
    return { value: await fn(), source };
  } catch (e) {
    const msg = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e);
    return { error: msg.slice(0, 200), source };
  }
}

export interface OnchainSnapshot {
  chain: "base";
  chainId: 8453;
  rpc: string;
  blockNumber: Field<string>;
  ethBalance: Field<string>;
  usdcBalance: Field<string>;
  usdcBalanceRaw: Field<string>;
  erc8004IdentityTokens: Field<string>;
  erc8004Agent?: {
    agentId: string;
    owner: Field<string>;
    tokenUri: Field<string>;
    reputationClients: Field<number>;
    reputationSummary: Field<{ count: string; value: string; decimals: number }>;
  };
  readAt: string;
}

export async function readOnchain(address: Address, agentId?: string | null): Promise<OnchainSnapshot> {
  const c = baseClient();
  const rpc = new URL(env.baseRpcUrl).host;
  const usdcSrc = `USDC.balanceOf @ ${CONTRACTS.usdc} (Base)`;
  const [blockNumber, ethBalance, usdcRaw, idTokens] = await Promise.all([
    field(`eth_blockNumber via ${rpc}`, async () => String(await c.getBlockNumber())),
    field(`eth_getBalance via ${rpc}`, async () => formatUnits(await c.getBalance({ address }), 18)),
    field(usdcSrc, async () => await c.readContract({ address: CONTRACTS.usdc, abi: erc20, functionName: "balanceOf", args: [address] })),
    field(`ERC-8004 Identity.balanceOf @ ${CONTRACTS.erc8004Identity}`, async () =>
      String(await c.readContract({ address: CONTRACTS.erc8004Identity, abi: identityAbi, functionName: "balanceOf", args: [address] })),
    ),
  ]);
  const out: OnchainSnapshot = {
    chain: "base",
    chainId: 8453,
    rpc,
    blockNumber,
    ethBalance,
    usdcBalanceRaw: "value" in usdcRaw ? { value: String(usdcRaw.value), source: usdcSrc } : usdcRaw,
    usdcBalance: "value" in usdcRaw ? { value: formatUnits(usdcRaw.value, 6), source: usdcSrc } : usdcRaw,
    erc8004IdentityTokens: idTokens,
    readAt: new Date().toISOString(),
  };
  if (agentId && /^\d+$/.test(agentId)) {
    const id = BigInt(agentId);
    const idSrc = `ERC-8004 Identity @ ${CONTRACTS.erc8004Identity}`;
    const repSrc = `ERC-8004 Reputation @ ${CONTRACTS.erc8004Reputation}`;
    const [owner, tokenUri, clients] = await Promise.all([
      field(`${idSrc} ownerOf(${agentId})`, async () => String(await c.readContract({ address: CONTRACTS.erc8004Identity, abi: identityAbi, functionName: "ownerOf", args: [id] }))),
      field(`${idSrc} tokenURI(${agentId})`, async () => {
        const uri = await c.readContract({ address: CONTRACTS.erc8004Identity, abi: identityAbi, functionName: "tokenURI", args: [id] });
        return uri.length > 2000 ? `${uri.slice(0, 2000)}…` : uri;
      }),
      field(`${repSrc} getClients(${agentId})`, async () =>
        (await c.readContract({ address: CONTRACTS.erc8004Reputation, abi: reputationAbi, functionName: "getClients", args: [id] })) as readonly Address[],
      ),
    ]);
    const clientList = "value" in clients ? clients.value : [];
    out.erc8004Agent = {
      agentId,
      owner,
      tokenUri,
      reputationClients: "value" in clients ? { value: clientList.length, source: clients.source } : clients,
      reputationSummary:
        clientList.length === 0
          ? { error: "no reputation feedback clients", source: `${repSrc} getSummary(${agentId})` }
          : await field(`${repSrc} getSummary(${agentId}, ${clientList.length} clients)`, async () => {
              const [count, value, decimals] = await c.readContract({
                address: CONTRACTS.erc8004Reputation,
                abi: reputationAbi,
                functionName: "getSummary",
                args: [id, [...clientList], "", ""],
              });
              return { count: String(count), value: String(value), decimals: Number(decimals) };
            }),
    };
  }
  return out;
}
