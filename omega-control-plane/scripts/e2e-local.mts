/**
 * End-to-end check against a running control plane with a real automaton home dir.
 *   OMEGA_URL=http://localhost:3100 CREATOR_KEY=0x… AUTOMATON_DIR=… AUTOMATON_DIST=… npx tsx scripts/e2e-local.mts
 * CREATOR_KEY must be the key for automaton.json creatorAddress. Exits non-zero on the first failed step.
 */
import { execFileSync } from "node:child_process";
import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { buildCommandMessage } from "../src/lib/command-message.ts";
import { totpCode, totpStep } from "../src/lib/totp.ts";
import { loadLocal } from "../agent/omega-sync.mts";

const url = process.env.OMEGA_URL!;
const creator = privateKeyToAccount(process.env.CREATOR_KEY as `0x${string}`);
const dir = process.env.AUTOMATON_DIR!;
const dist = process.env.AUTOMATON_DIST!;
const { account: agent } = loadLocal(dir);
let cookie = "";

async function call(path: string, init: RequestInit = {}, expect = [200, 201, 202]) {
  const res = await fetch(url + path, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });
  const set = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  if (set.length) cookie = [...cookie.split("; ").filter((c) => c && !set.some((s) => s.split("=")[0] === c.split("=")[0])), ...set].join("; ");
  const body = await res.json().catch(() => ({}));
  const ok = expect.includes(res.status);
  console.log(`${ok ? "PASS" : "FAIL"} ${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  if (!ok) process.exit(1);
  return body;
}

const sync = (...extra: string[]) =>
  console.log(execFileSync("npx", ["tsx", "agent/omega-sync.mts", "--url", url, "--dir", dir, ...extra], { encoding: "utf8" }).trim());

await call("/api/health");
await call("/api/agents", { method: "POST", body: JSON.stringify({ address: agent.address }) }, [401]);
const { nonce } = await call("/api/auth/nonce");
const message = createSiweMessage({ domain: new URL(url).host, address: creator.address, uri: url, version: "1", chainId: 8453, nonce, issuedAt: new Date() });
await call("/api/auth/siwe", { method: "POST", body: JSON.stringify({ message, signature: await creator.signMessage({ message }) }) });
await call("/api/auth/me");
await call("/api/agents", { method: "POST", body: JSON.stringify({ address: agent.address, name: "e2e" }) }, [201, 409]);
sync();
const status = await call(`/api/agents/${agent.address}/status`);
if (!status.snapshot) throw new Error("no snapshot after sync");
for (const p of ["economics", "orchestration", "memory", "soul", "treasury", "snapshots"]) await call(`/api/agents/${agent.address}/${p}`);

const cmd = (type: "topup" | "soul_update" | "payout", payload: Record<string, unknown>) =>
  buildCommandMessage({ agent: agent.address, type, payload, nonce: crypto.randomUUID(), issuedAt: new Date().toISOString() });
const bad = cmd("topup", { amountUsd: 7 });
await call(`/api/agents/${agent.address}/topup`, { method: "POST", body: JSON.stringify({ message: bad, signature: await creator.signMessage({ message: bad }) }) }, [400]);
const big = cmd("topup", { amountUsd: 100 });
await call(`/api/agents/${agent.address}/topup`, { method: "POST", body: JSON.stringify({ message: big, signature: await creator.signMessage({ message: big }) }) }, [403]);
const forged = cmd("topup", { amountUsd: 5 });
await call(`/api/agents/${agent.address}/topup`, { method: "POST", body: JSON.stringify({ message: forged, signature: await agent.signMessage({ message: forged }) }) }, [401]);
const top = cmd("topup", { amountUsd: 5 });
const topSig = await creator.signMessage({ message: top });
await call(`/api/agents/${agent.address}/topup`, { method: "POST", body: JSON.stringify({ message: top, signature: topSig }) });
await call(`/api/agents/${agent.address}/topup`, { method: "POST", body: JSON.stringify({ message: top, signature: topSig }) }, [409]);
const soul = cmd("soul_update", { content: `# e2e-local-test\n\n## Core Purpose\nEnd-to-end test of the omega control plane soul update path (${new Date().toISOString()}).\n` });
await call(`/api/agents/${agent.address}/soul`, { method: "PUT", body: JSON.stringify({ message: soul, signature: await creator.signMessage({ message: soul }) }) });
const PAYOUT = "0x4D11f9f5bB127D4c2e971c2e62b93CAF957b7F0d";
const elsewhere = cmd("payout", { amountUsd: 1, to: creator.address });
await call(`/api/agents/${agent.address}/payout`, { method: "POST", body: JSON.stringify({ message: elsewhere, signature: await creator.signMessage({ message: elsewhere }) }) }, [400]);
const noSurplus = cmd("payout", { amountUsd: 1, to: PAYOUT });
await call(`/api/agents/${agent.address}/payout`, { method: "POST", body: JSON.stringify({ message: noSurplus, signature: await creator.signMessage({ message: noSurplus }) }) }, [403]);
await call(`/api/agents/${agent.address}/commands`, {}, [401]);
await call(`/api/agents/${agent.address}/profit`, {}, [200]);

sync("--apply", "--automaton-dist", dist);
sync();
const after = await call(`/api/agents/${agent.address}/soul`);
console.log("soul_update statuses:", after.updates.map((u: { id: string; status: string }) => `${u.id}:${u.status}`).join(", "));
const econ = await call(`/api/agents/${agent.address}/economics`);
console.log("topup statuses:", econ.topups.map((u: { id: string; status: string; result: unknown }) => `${u.id}:${u.status}:${JSON.stringify(u.result)}`).join(" | "));
// TOTP 2FA: once on, creator commands need a fresh code; a time step is accepted once.
const tf = await call("/api/auth/totp", { method: "POST", body: JSON.stringify({ action: "setup" }) });
const t0 = Date.now() / 1000;
await call("/api/auth/totp", { method: "POST", body: JSON.stringify({ action: "enable", code: totpCode(tf.secret, t0) }) });
const soulPath = `/api/agents/${agent.address}/soul`;
const tfMsg = cmd("soul_update", { content: `# e2e 2FA check ${new Date().toISOString()}\n` });
const tfSig = await creator.signMessage({ message: tfMsg });
await call(soulPath, { method: "PUT", body: JSON.stringify({ message: tfMsg, signature: tfSig }) }, [401]);
const nextCode = totpCode(tf.secret, t0 + 30);
await call(soulPath, { method: "PUT", body: JSON.stringify({ message: tfMsg, signature: tfSig, totp: nextCode }) }, [202]);
const tfMsg2 = cmd("soul_update", { content: `# e2e 2FA reuse ${new Date().toISOString()}\n` });
await call(soulPath, { method: "PUT", body: JSON.stringify({ message: tfMsg2, signature: await creator.signMessage({ message: tfMsg2 }), totp: nextCode }) }, [409]);
await new Promise((r) => setTimeout(r, Math.max(0, (totpStep(t0) + 1) * 30 - Date.now() / 1000) * 1000 + 1000));
await call("/api/auth/totp", { method: "POST", body: JSON.stringify({ action: "disable", code: totpCode(tf.secret, (totpStep(t0) + 2) * 30) }) });

const audit = await call("/api/audit");
console.log("audit:", JSON.stringify(audit.verification));
if (!audit.verification.ok) process.exit(1);
const metrics = await (await fetch(url + "/api/metrics")).text();
console.log(metrics.split("\n").filter((l) => l && !l.startsWith("#")).join("\n"));
