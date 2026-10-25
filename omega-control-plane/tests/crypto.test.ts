import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { auditHash, GENESIS_HASH, verifyAuditRows, type AuditRow } from "../src/lib/audit";
import { buildCommandMessage, parseCommandMessage, snapshotMessage } from "../src/lib/command-message";
import { canonicalJson, sha256Hex } from "../src/lib/hash";
import { signToken, verifyToken } from "../src/lib/session";
import { verifySignedSnapshot } from "../src/lib/snapshot";
import { getAddress } from "viem";
import { isPayoutAmount, PAYOUT_WALLET, usdcUnits } from "../src/lib/payout";
import { survivalTier } from "../src/lib/survival";

const SECRET = "x".repeat(40);

describe("survivalTier matches automaton v0.2.1 getSurvivalTier", () => {
  it.each([
    [501, "high"],
    [500, "normal"],
    [51, "normal"],
    [50, "low_compute"],
    [11, "low_compute"],
    [10, "critical"],
    [0, "critical"],
    [-1, "dead"],
  ])("%i cents -> %s", (c, t) => expect(survivalTier(c)).toBe(t));
});

describe("session tokens", () => {
  it("round-trips and rejects tampering / other secrets", () => {
    const t = signToken({ address: "0xabc" }, 60, SECRET);
    expect(verifyToken<{ address: string }>(t, SECRET)?.address).toBe("0xabc");
    expect(verifyToken(t, "y".repeat(40))).toBeNull();
    const [body, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ address: "0xevil", exp: 9e9 })).toString("base64url");
    expect(verifyToken(`${forged}.${mac}`, SECRET)).toBeNull();
    expect(verifyToken(`${body}.`, SECRET)).toBeNull();
  });
  it("expires", () => {
    expect(verifyToken(signToken({ a: 1 }, -1, SECRET), SECRET)).toBeNull();
  });
});

describe("canonicalJson", () => {
  it("is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }));
  });
});

describe("command messages", () => {
  const env = { agent: "0x702445701b95f7c6D5806cAe19f63c95c71Be03F", type: "topup" as const, payload: { amountUsd: 5 }, nonce: "n1", issuedAt: "2026-10-25T00:00:00.000Z" };
  it("parse(build(x)) == x", () => expect(parseCommandMessage(buildCommandMessage(env))).toEqual(env));
  it("rejects non-canonical or unknown types", () => {
    expect(parseCommandMessage(buildCommandMessage(env).replace('{"amountUsd":5}', '{ "amountUsd": 5 }'))).toBeNull();
    expect(parseCommandMessage(buildCommandMessage(env).replace("type: topup", "type: withdraw"))).toBeNull();
    expect(parseCommandMessage(buildCommandMessage(env) + "\nextra: 1")).toBeNull();
  });
  it("survives newlines in soul content", () => {
    const s = { ...env, type: "soul_update" as const, payload: { content: "# Soul\nline 2\n" } };
    expect(parseCommandMessage(buildCommandMessage(s))).toEqual(s);
  });
});

describe("payout", () => {
  it("wallet is the operator-supplied address, checksummed", () => {
    expect(PAYOUT_WALLET).toBe(getAddress("0x4d11f9f5bb127d4c2e971c2e62b93caf957b7f0d"));
  });
  it("validates amounts", () => {
    for (const ok of [0.01, 1, 12.5, 1000.99]) expect(isPayoutAmount(ok)).toBe(true);
    for (const bad of [0, -1, 0.001, NaN, Infinity, "5", 2_000_000]) expect(isPayoutAmount(bad)).toBe(false);
  });
  it("converts to USDC units exactly", () => {
    expect(usdcUnits(0.29)).toBe(290_000n);
    expect(usdcUnits(12.5)).toBe(12_500_000n);
    expect(usdcUnits(100)).toBe(100_000_000n);
  });
  it("round-trips a payout command", () => {
    const env = { agent: PAYOUT_WALLET, type: "payout" as const, payload: { amountUsd: 1.5, to: PAYOUT_WALLET }, nonce: "n", issuedAt: "2026-10-25T00:00:00.000Z" };
    expect(parseCommandMessage(buildCommandMessage(env))).toEqual(env);
  });
});

describe("audit chain", () => {
  const mk = (n: number): AuditRow[] => {
    let prev = GENESIS_HASH;
    return Array.from({ length: n }, (_, i) => {
      const rec = { at: new Date(1_700_000_000_000 + i * 1000).toISOString(), actor: "0xa", agentAddress: null, action: `a${i}`, details: { i }, ipAddress: null };
      const hash = auditHash(prev, rec);
      const row = { seq: String(i + 1), at: rec.at, actor: rec.actor, agent_address: null, action: rec.action, details: rec.details, ip_address: null, prev_hash: prev, hash } as unknown as AuditRow;
      prev = hash;
      return row;
    });
  };
  it("verifies an intact chain", () => expect(verifyAuditRows(mk(5)).ok).toBe(true));
  it("detects an edited record", () => {
    const rows = mk(5);
    (rows[2] as unknown as { details: unknown }).details = { i: 99 };
    expect(verifyAuditRows(rows)).toMatchObject({ ok: false, brokenAt: "3" });
  });
  it("detects a deleted record", () => {
    const rows = mk(5);
    rows.splice(1, 1);
    expect(verifyAuditRows(rows)).toMatchObject({ ok: false, brokenAt: "3" });
  });
});

describe("signed snapshot verification", () => {
  const key = generatePrivateKey();
  const acct = privateKeyToAccount(key);
  const payload = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ v: 1, agentAddress: acct.address, capturedAt: new Date().toISOString(), source: { tool: "t", version: "1" }, config: {}, creditsCents: 42, creditsSource: "test", survivalTier: null, agentState: "running", turnCount: 3, ...over });
  const sign = async (raw: string) => ({ payload: raw, signature: await acct.signMessage({ message: snapshotMessage(sha256Hex(raw)) }) });

  it("accepts a valid agent signature and derives the tier", async () => {
    const v = await verifySignedSnapshot(await sign(payload()), acct.address);
    expect(v.tier).toBe("low_compute");
    expect(v.agent).toBe(acct.address);
  });
  it("rejects a payload altered after signing", async () => {
    const s = await sign(payload());
    await expect(verifySignedSnapshot({ ...s, payload: s.payload.replace('"creditsCents":42', '"creditsCents":99999') }, acct.address)).rejects.toThrow(/signature/);
  });
  it("rejects a signature by a different wallet", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const raw = payload();
    const signature = await other.signMessage({ message: snapshotMessage(sha256Hex(raw)) });
    await expect(verifySignedSnapshot({ payload: raw, signature }, acct.address)).rejects.toThrow(/signature/);
  });
  it("rejects URL/payload agent mismatch", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    await expect(verifySignedSnapshot(await sign(payload()), other.address)).rejects.toThrow();
  });
  it("rejects stale snapshots", async () => {
    await expect(verifySignedSnapshot(await sign(payload({ capturedAt: new Date(Date.now() - 3600_000).toISOString() })), acct.address)).rejects.toThrow(/freshness/);
  });
});
