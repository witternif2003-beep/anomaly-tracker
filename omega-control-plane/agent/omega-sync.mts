/**
 * omega-sync — runs next to a Conway Automaton (v0.2.x).
 *
 * Reads ~/.automaton/{automaton.json,wallet.json,SOUL.md,state.db} (state.db opened read-only),
 * signs a snapshot with the agent's own wallet (EIP-191) and POSTs it to the control plane.
 * The private key never leaves this machine.
 *
 * With --apply it also pulls creator-signed commands, re-verifies the creator signature locally
 * against automaton.json creatorAddress, and executes them with the automaton's own code
 * (conway/topup.js topupCredits via x402; soul/tools.js updateSoul; payouts as a USDC transfer on Base
 * to the fixed PAYOUT_WALLET only), then posts a signed ack.
 *
 *   npx tsx agent/omega-sync.mts --url https://<control-plane> [--dir ~/.automaton] [--interval 60] [--apply --automaton-dist <path/to/automaton/dist>]
 *     [--keep-alive [--keep-alive-usd 5] [--keep-alive-daily-cap 25]]   # auto-topup from the agent's own USDC when credits < 50c
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { createPublicClient, createWalletClient, getAddress, http, isAddress, parseAbi, verifyMessage, type Hex } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { ackMessage, parseCommandMessage, pullMessage, snapshotMessage } from "../src/lib/command-message.ts";
import { sha256Hex } from "../src/lib/hash.ts";
import { isPayoutAmount, PAYOUT_WALLET, USDC_BASE, usdcUnits } from "../src/lib/payout.ts";

const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address to, uint256 amount) returns (bool)"]);

/** USDC transfer on Base from the agent wallet to the fixed payout wallet. Never any other destination. */
export async function sendPayout(account: PrivateKeyAccount, payload: Record<string, unknown>) {
  const to = String(payload.to);
  if (!isAddress(to) || getAddress(to) !== PAYOUT_WALLET) return { status: "rejected" as const, result: { reason: `destination ${to} is not the fixed payout wallet ${PAYOUT_WALLET}` } };
  if (!isPayoutAmount(payload.amountUsd)) return { status: "rejected" as const, result: { reason: "invalid amountUsd" } };
  const units = usdcUnits(payload.amountUsd);
  const transport = http(process.env.BASE_RPC_URL || "https://mainnet.base.org");
  const pub = createPublicClient({ chain: base, transport });
  const balance = await pub.readContract({ address: USDC_BASE, abi: ERC20, functionName: "balanceOf", args: [account.address] });
  if (balance < units) return { status: "failed" as const, result: { error: "insufficient USDC on Base", balanceUnits: String(balance), amountUsd: payload.amountUsd } };
  const wallet = createWalletClient({ account, chain: base, transport });
  const hash = await wallet.writeContract({ address: USDC_BASE, abi: ERC20, functionName: "transfer", args: [PAYOUT_WALLET, units] });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return {
    status: receipt.status === "success" ? ("applied" as const) : ("failed" as const),
    result: { txHash: hash, blockNumber: String(receipt.blockNumber), to: PAYOUT_WALLET, amountUsd: payload.amountUsd, explorer: `https://basescan.org/tx/${hash}` },
  };
}

const VERSION = "1.0.0";
const ROW_LIMIT = 50;
const STR_LIMIT = 2000;
const SECRET_KEY_RE = /key|secret|token|private|password|mnemonic|seed/i;

const TABLES: Record<string, string> = {
  turns: "timestamp",
  tool_calls: "created_at",
  heartbeat_entries: "updated_at",
  heartbeat_schedule: "task_name",
  heartbeat_history: "started_at",
  transactions: "created_at",
  children: "created_at",
  registry: "registered_at",
  reputation: "created_at",
  policy_decisions: "created_at",
  spend_tracking: "created_at",
  wake_events: "created_at",
  working_memory: "created_at",
  episodic_memory: "created_at",
  session_summaries: "created_at",
  semantic_memory: "updated_at",
  procedural_memory: "updated_at",
  relationship_memory: "updated_at",
  inference_costs: "created_at",
  model_registry: "model_id",
  child_lifecycle_events: "created_at",
  onchain_transactions: "created_at",
  metric_snapshots: "snapshot_at",
  goals: "created_at",
  task_graph: "created_at",
  event_stream: "created_at",
  knowledge_store: "created_at",
};

const AGGREGATES: Record<string, { tables: string[]; sql: string }> = {
  inference_totals: {
    tables: ["inference_costs"],
    sql: "SELECT COUNT(*) AS calls, COALESCE(SUM(cost_cents),0) AS cost_cents, COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens FROM inference_costs",
  },
  inference_by_model: {
    tables: ["inference_costs"],
    sql: "SELECT model, provider, COUNT(*) AS calls, SUM(cost_cents) AS cost_cents, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, AVG(latency_ms) AS avg_latency_ms FROM inference_costs GROUP BY model, provider ORDER BY cost_cents DESC LIMIT 50",
  },
  inference_by_day: {
    tables: ["inference_costs"],
    sql: "SELECT substr(created_at,1,10) AS day, COUNT(*) AS calls, SUM(cost_cents) AS cost_cents FROM inference_costs GROUP BY day ORDER BY day DESC LIMIT 90",
  },
  transactions_by_type: {
    tables: ["transactions"],
    sql: "SELECT type, COUNT(*) AS n, SUM(amount_cents) AS total_cents FROM transactions GROUP BY type",
  },
  event_stream_by_type: {
    tables: ["event_stream"],
    sql: "SELECT type, COUNT(*) AS n, SUM(token_count) AS tokens FROM event_stream GROUP BY type ORDER BY n DESC",
  },
  tool_calls_by_name: {
    tables: ["tool_calls"],
    sql: "SELECT name, COUNT(*) AS n, SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS errors, AVG(duration_ms) AS avg_ms FROM tool_calls GROUP BY name ORDER BY n DESC LIMIT 100",
  },
};

const MEMORY_TABLES = ["working_memory", "episodic_memory", "session_summaries", "semantic_memory", "procedural_memory", "relationship_memory", "knowledge_store", "event_stream"];

type Row = Record<string, unknown>;

function expandHome(p: string) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function clean(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "bigint") out[k] = Number(v);
    else if (typeof v === "string" && v.length > STR_LIMIT) out[k] = v.slice(0, STR_LIMIT) + `…[+${v.length - STR_LIMIT} chars]`;
    else if (v instanceof Uint8Array) out[k] = `[blob ${v.byteLength} bytes]`;
    else out[k] = v;
  }
  return out;
}

interface AutomatonConfig {
  name?: string;
  walletAddress?: string;
  creatorAddress?: string;
  sandboxId?: string;
  inferenceModel?: string;
  version?: string;
  conwayApiUrl?: string;
  conwayApiKey?: string;
  dbPath?: string;
}

export function loadLocal(dir: string) {
  const config = JSON.parse(fs.readFileSync(path.join(dir, "automaton.json"), "utf8")) as AutomatonConfig;
  const wallet = JSON.parse(fs.readFileSync(path.join(dir, "wallet.json"), "utf8")) as { privateKey?: Hex; chainType?: string };
  if (wallet.chainType === "solana" || !wallet.privateKey) throw new Error("omega-sync supports EVM automaton wallets only");
  const account = privateKeyToAccount(wallet.privateKey);
  const dbPath = expandHome(config.dbPath || path.join(dir, "state.db"));
  return { config, account, dbPath };
}

async function readCredits(config: AutomatonConfig, kv: Record<string, string>) {
  const apiUrl = config.conwayApiUrl || "https://api.conway.tech";
  if (config.conwayApiKey) {
    try {
      const res = await fetch(`${apiUrl}/v1/credits/balance`, { headers: { Authorization: config.conwayApiKey }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const j = (await res.json()) as { balance_cents?: number; credits_cents?: number };
        const cents = j.balance_cents ?? j.credits_cents;
        if (typeof cents === "number") return { creditsCents: Math.round(cents), creditsSource: `GET ${apiUrl}/v1/credits/balance (live)` };
      }
    } catch {
      /* fall through to the agent's own last reading */
    }
  }
  try {
    const f = JSON.parse(kv.financial_state ?? "") as { creditsCents?: number; lastChecked?: string };
    if (typeof f.creditsCents === "number") return { creditsCents: Math.round(f.creditsCents), creditsSource: `state.db kv financial_state (lastChecked ${f.lastChecked ?? "?"})` };
  } catch {
    /* none */
  }
  return { creditsCents: null, creditsSource: "unavailable (no Conway API key and no kv financial_state)" };
}

export async function buildSnapshot(dir: string, config: AutomatonConfig, account: PrivateKeyAccount, dbPath: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const present = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name));
    const colsOf = (t: string) => new Set((db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
    const tables: Record<string, Row[]> = {};
    const missingTables: string[] = [];
    for (const [t, orderCol] of Object.entries(TABLES)) {
      if (!present.has(t)) {
        missingTables.push(t);
        continue;
      }
      const order = colsOf(t).has(orderCol) ? `ORDER BY ${orderCol} DESC` : "ORDER BY rowid DESC";
      tables[t] = (db.prepare(`SELECT * FROM ${t} ${order} LIMIT ${ROW_LIMIT}`).all() as Row[]).map(clean);
    }
    const aggregates: Record<string, Row[]> = {};
    for (const [name, a] of Object.entries(AGGREGATES)) {
      if (a.tables.every((t) => present.has(t))) {
        try {
          aggregates[name] = (db.prepare(a.sql).all() as Row[]).map(clean);
        } catch {
          /* column drift across automaton versions */
        }
      }
    }
    aggregates.memory_counts = MEMORY_TABLES.filter((t) => present.has(t)).map((t) => ({
      table: t,
      rows: Number((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n),
    }));

    const kv: Record<string, string> = {};
    if (present.has("kv")) {
      for (const r of db.prepare("SELECT key, value FROM kv").all() as { key: string; value: string }[]) {
        if (!SECRET_KEY_RE.test(r.key)) kv[r.key] = r.value.slice(0, 20_000);
      }
    }
    const turnCount = present.has("turns") ? Number((db.prepare("SELECT COUNT(*) AS n FROM turns").get() as { n: number }).n) : 0;
    const soulPath = path.join(dir, "SOUL.md");
    const soul = {
      content: fs.existsSync(soulPath) ? fs.readFileSync(soulPath, "utf8").slice(0, 100_000) : null,
      history: present.has("soul_history")
        ? (db.prepare("SELECT id, version, content_hash, change_source, change_reason, approved_by, created_at FROM soul_history ORDER BY version DESC LIMIT 20").all() as Row[]).map(clean)
        : [],
    };
    const credits = await readCredits(config, kv);
    return {
      v: 1 as const,
      agentAddress: account.address,
      capturedAt: new Date().toISOString(),
      source: { tool: "omega-sync", version: VERSION, dbPath },
      config: {
        name: config.name,
        walletAddress: config.walletAddress,
        creatorAddress: config.creatorAddress,
        sandboxId: config.sandboxId,
        inferenceModel: config.inferenceModel,
        version: config.version,
      },
      ...credits,
      survivalTier: null,
      agentState: kv.agent_state ?? null,
      turnCount,
      kv,
      soul,
      tables,
      aggregates,
      missingTables,
    };
  } finally {
    db.close();
  }
}

export async function signPayload(account: PrivateKeyAccount, payload: unknown) {
  const raw = JSON.stringify(payload);
  const signature = await account.signMessage({ message: snapshotMessage(sha256Hex(raw)) });
  return { payload: raw, signature };
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text };
}

interface PulledCommand {
  id: string;
  type: "topup" | "soul_update" | "payout";
  message: string;
  creator_signature: Hex;
}

async function execute(
  env: NonNullable<ReturnType<typeof parseCommandMessage>>,
  c: PulledCommand,
  account: PrivateKeyAccount,
  config: AutomatonConfig,
  dir: string,
  dist: string,
  creator: string | null,
): Promise<{ status: "applied" | "failed" | "rejected"; result: Record<string, unknown> }> {
  let status: "applied" | "failed" | "rejected" = "rejected";
  let result: Record<string, unknown> = {};
  if (env.type === "payout") {
    return await sendPayout(account, env.payload);
  } else if (env.type === "topup") {
    const { topupCredits } = await import(pathToFileURL(path.join(dist, "conway/topup.js")).href);
    const r = await topupCredits(config.conwayApiUrl || "https://api.conway.tech", account, Number(env.payload.amountUsd));
    status = r.success ? "applied" : "failed";
    result = r;
  } else if (env.type === "soul_update") {
    const require = createRequire(path.join(dist, "index.js"));
    const Database = require("better-sqlite3");
    const { parseSoulMd } = await import(pathToFileURL(path.join(dist, "soul/model.js")).href);
    const { updateSoul } = await import(pathToFileURL(path.join(dist, "soul/tools.js")).href);
    const db = new Database(loadLocal(dir).dbPath);
    try {
      const r = await updateSoul(db, parseSoulMd(String(env.payload.content)), "human", `omega control plane command ${c.id} signed by ${creator}`, path.join(dir, "SOUL.md"));
      status = r.success ? "applied" : "failed";
      result = r;
    } finally {
      db.close();
    }
  }
  return { status, result };
}

async function applyCommands(baseUrl: string, account: PrivateKeyAccount, config: AutomatonConfig, dir: string, dist: string) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = await account.signMessage({ message: pullMessage(account.address, ts) });
  const res = await fetch(`${baseUrl}/api/agents/${account.address}/commands`, { headers: { "x-omega-ts": String(ts), "x-omega-sig": sig } });
  if (!res.ok) throw new Error(`pull failed: HTTP ${res.status} ${await res.text()}`);
  const { commands } = (await res.json()) as { commands: PulledCommand[] };
  for (const c of commands) {
    let status: "applied" | "failed" | "rejected" = "rejected";
    let result: Record<string, unknown> = {};
    const env = parseCommandMessage(c.message);
    const creator = config.creatorAddress ? getAddress(config.creatorAddress) : null;
    const sigOk = !!creator && (await verifyMessage({ address: creator, message: c.message, signature: c.creator_signature }).catch(() => false));
    if (!env || !sigOk || getAddress(env.agent) !== account.address || env.type !== c.type) {
      result = { reason: "local verification failed: creator signature / agent / type mismatch" };
    } else {
      try {
        ({ status, result } = await execute(env, c, account, config, dir, dist, creator));
      } catch (e) {
        status = "failed";
        result = { error: e instanceof Error ? e.message.slice(0, 500) : String(e) };
      }
    }
    const ackPayload = JSON.stringify({ commandId: String(c.id), status, result, at: new Date().toISOString() });
    const ackSig = await account.signMessage({ message: ackMessage(sha256Hex(ackPayload)) });
    const ack = await post(`${baseUrl}/api/agents/${account.address}/commands/${c.id}`, { payload: ackPayload, signature: ackSig });
    console.log(`[omega-sync] command ${c.id} ${c.type}: ${status} (ack HTTP ${ack.status})`);
  }
}

const KEEP_ALIVE_TIERS = [5, 25, 100, 500, 1000, 2500];
const LOW_COMPUTE_BELOW_CENTS = 50; // automaton SURVIVAL_THRESHOLDS.normal: below this the agent is low_compute

/**
 * Local survival guard: when credits fall below the normal tier, buy one Conway credit topup
 * from the agent's own USDC (automaton topupCredits via x402), at most dailyCapUsd per 24 h.
 * Attempts are logged to <dir>/omega-keepalive.json. Cannot help once the wallet has no USDC.
 */
export async function keepAlive(dir: string, config: AutomatonConfig, account: PrivateKeyAccount, creditsCents: number | null, amountUsd: number, dailyCapUsd: number, dist: string) {
  if (creditsCents == null) return console.log("[omega-sync] keep-alive: credits unknown, skipped");
  if (creditsCents >= LOW_COMPUTE_BELOW_CENTS) return;
  const logPath = path.join(dir, "omega-keepalive.json");
  const log: { at: string; amountUsd: number; success: boolean; error?: string }[] = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf8")) : [];
  const spent = log.filter((e) => Date.now() - Date.parse(e.at) < 86_400_000).reduce((t, e) => t + e.amountUsd, 0);
  if (spent + amountUsd > dailyCapUsd) return console.log(`[omega-sync] keep-alive: credits ${creditsCents}c but 24 h cap $${dailyCapUsd} reached ($${spent} attempted)`);
  const { topupCredits } = await import(pathToFileURL(path.join(dist, "conway/topup.js")).href);
  const r = (await topupCredits(config.conwayApiUrl || "https://api.conway.tech", account, amountUsd)) as { success: boolean; error?: string };
  log.push({ at: new Date().toISOString(), amountUsd, success: r.success, error: r.error });
  fs.writeFileSync(logPath, JSON.stringify(log.slice(-200), null, 2));
  console.log(`[omega-sync] keep-alive: credits ${creditsCents}c -> topup $${amountUsd}: ${r.success ? "ok" : `failed ${r.error ?? ""}`}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      dir: { type: "string", default: "~/.automaton" },
      interval: { type: "string" },
      apply: { type: "boolean", default: false },
      "automaton-dist": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "keep-alive": { type: "boolean", default: false },
      "keep-alive-usd": { type: "string", default: "5" },
      "keep-alive-daily-cap": { type: "string", default: "25" },
    },
  });
  const dir = expandHome(values.dir!);
  const baseUrl = (values.url ?? process.env.OMEGA_URL ?? "").replace(/\/$/, "");
  if (!baseUrl && !values["dry-run"]) throw new Error("--url (or OMEGA_URL) is required");
  if ((values.apply || values["keep-alive"]) && !values["automaton-dist"]) throw new Error("--apply / --keep-alive need --automaton-dist <path to @conway/automaton dist>");
  const keepAliveUsd = Number(values["keep-alive-usd"]);
  const keepAliveCap = Number(values["keep-alive-daily-cap"]);
  if (values["keep-alive"] && !KEEP_ALIVE_TIERS.includes(keepAliveUsd)) throw new Error(`--keep-alive-usd must be one of ${KEEP_ALIVE_TIERS.join(", ")}`);
  const { config, account, dbPath } = loadLocal(dir);

  const once = async () => {
    const snap = await buildSnapshot(dir, config, account, dbPath);
    const signed = await signPayload(account, snap);
    if (values["dry-run"]) {
      console.log(JSON.stringify({ agent: account.address, bytes: signed.payload.length, turnCount: snap.turnCount, creditsCents: snap.creditsCents, missingTables: snap.missingTables }));
      return;
    }
    const r = await post(`${baseUrl}/api/agents/${account.address}/snapshots`, signed);
    console.log(`[omega-sync] ${new Date().toISOString()} snapshot ${signed.payload.length} bytes -> HTTP ${r.status} ${r.body.slice(0, 200)}`);
    if (values.apply) await applyCommands(baseUrl, account, config, dir, expandHome(values["automaton-dist"]!));
    if (values["keep-alive"]) await keepAlive(dir, config, account, snap.creditsCents, keepAliveUsd, keepAliveCap, expandHome(values["automaton-dist"]!));
  };

  await once();
  const every = Number(values.interval ?? 0);
  if (every > 0) {
    setInterval(() => once().catch((e) => console.error("[omega-sync]", e instanceof Error ? e.message : e)), every * 1000);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error("[omega-sync]", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
