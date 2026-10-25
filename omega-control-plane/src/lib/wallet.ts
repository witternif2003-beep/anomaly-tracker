"use client";
import { createWalletClient, custom, type Address, type EIP1193Provider } from "viem";
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

export async function connect(): Promise<{ address: Address; sign: (message: string) => Promise<`0x${string}`> }> {
  const provider = getProvider();
  if (!provider) throw new NoWalletError("No wallet in this browser. Open this page in Phantom (or another Ethereum wallet app) to sign in.");
  const client = createWalletClient({ chain: base, transport: custom(provider) });
  const [address] = await client.requestAddresses();
  if (!address) throw new Error("wallet returned no account");
  return { address, sign: (message: string) => client.signMessage({ account: address, message }) };
}
