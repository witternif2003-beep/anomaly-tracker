"use client";
import { createWalletClient, custom, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { base } from "viem/chains";

type Injected = EIP1193Provider & { isPhantom?: boolean };

declare global {
  interface Window {
    ethereum?: Injected;
    phantom?: { ethereum?: Injected };
  }
}

export class NoWalletError extends Error {}

/** Phantom's EVM provider first (window.phantom.ethereum, avoids window.ethereum collisions), then any injected wallet. */
export function getProvider(): Injected | null {
  if (typeof window === "undefined") return null;
  const phantom = window.phantom?.ethereum;
  if (phantom?.isPhantom) return phantom;
  return window.ethereum ?? null;
}

export function hasWallet(): boolean {
  return getProvider() !== null;
}

/** Phantom universal link that reopens this page inside Phantom's in-app browser (docs.phantom.com/phantom-deeplinks/other-methods/browse). */
export function phantomBrowseUrl(): string {
  return `https://phantom.com/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`;
}

export async function connect(): Promise<{ address: Address; chainId: number; sign: (message: string) => Promise<`0x${string}`> }> {
  const provider = getProvider();
  if (!provider) throw new NoWalletError("No wallet in this browser. Open this page in Phantom (or another Ethereum wallet app) to sign in.");
  const client = createWalletClient({ chain: base, transport: custom(provider) });
  const [address] = await client.requestAddresses();
  if (!address) throw new Error("wallet returned no account");
  const chainId = await preferBase(client);
  return { address, chainId, sign: (message: string) => client.signMessage({ account: address, message }) };
}

/** Asks the wallet to switch to Base, then returns the chain it is actually on so SIWE "Chain ID" matches it. */
async function preferBase(client: WalletClient): Promise<number> {
  try {
    if ((await client.getChainId()) !== base.id) await client.switchChain({ id: base.id });
  } catch {
    // Wallet declined or cannot switch; sign on the chain it reports.
  }
  try {
    return await client.getChainId();
  } catch {
    return base.id;
  }
}

/** Wallet/RPC error as one line, keeping the provider's own code and detail (viem's short message alone hides them). */
export function walletErrorText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const x = e as Error & { shortMessage?: string; details?: string; code?: number };
  const head = (x.shortMessage ?? x.message).split("\n")[0];
  const extra = [x.code != null ? `code ${x.code}` : null, x.details && !head.includes(x.details) ? x.details : null].filter(Boolean).join(": ");
  return extra ? `${head} (${extra})` : head;
}

const erc20Transfer = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/** Asks the connected wallet to send USDC on Base; the user approves it in the wallet. Returns the tx hash. */
export async function sendUsdcOnBase(usdc: Address, to: Address, units: bigint): Promise<`0x${string}`> {
  const provider = getProvider();
  if (!provider) throw new NoWalletError("No wallet in this browser. Open this page in Phantom (or another Ethereum wallet app), or send to the address above from any wallet.");
  const client = createWalletClient({ chain: base, transport: custom(provider) });
  const [account] = await client.requestAddresses();
  if (!account) throw new Error("wallet returned no account");
  if ((await preferBase(client)) !== base.id) throw new Error("Switch your wallet to the Base network, then try again.");
  return await client.writeContract({ account, address: usdc, abi: erc20Transfer, functionName: "transfer", args: [to, units] });
}
