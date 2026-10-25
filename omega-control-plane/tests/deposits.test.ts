import { describe, expect, it } from "vitest";
import { depositsFromLogs } from "../src/lib/deposits";

const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

describe("depositsFromLogs", () => {
  it("formats USDC amounts, checksums senders, sorts newest first and drops incomplete logs", () => {
    const from = "0x4d11f9f5bb127d4c2e971c2e62b93caf957b7f0d";
    const out = depositsFromLogs(
      [
        { transactionHash: h(1), blockNumber: 10n, args: { from, value: 5_000_000n } },
        { transactionHash: h(2), blockNumber: 12n, args: { from, value: 1_230_000n } },
        { transactionHash: null, blockNumber: 13n, args: { from, value: 1n } },
      ],
      new Map([[12n, 1_792_000_000]]),
    );
    expect(out.map((d) => d.amountUsdc)).toEqual(["1.23", "5"]);
    expect(out[0].from).toBe("0x4D11f9f5bB127D4c2e971c2e62b93CAF957b7F0d");
    expect(out[0].at).toBe(new Date(1_792_000_000_000).toISOString());
    expect(out[1].at).toBeNull();
    expect(out[0].explorer).toBe(`https://basescan.org/tx/${h(2)}`);
  });
});
