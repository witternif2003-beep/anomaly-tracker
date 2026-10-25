"use client";
import { createWalletClient, custom, type Address, type EIP1193Provider } from "viem";
import { base } from "viem/chains";

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connect(): Promise<{ address: Address; sign: (message: string) => Promise<`0x${string}`> }> {
  if (!window.ethereum) throw new Error("No injected wallet. Open this page in MetaMask / Coinbase Wallet / Rabby.");
  const client = createWalletClient({ chain: base, transport: custom(window.ethereum) });
  const [address] = await client.requestAddresses();
  if (!address) throw new Error("wallet returned no account");
  return { address, sign: (message: string) => client.signMessage({ account: address, message }) };
}
