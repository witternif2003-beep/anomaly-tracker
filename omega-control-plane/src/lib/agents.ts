import type postgres from "postgres";
import { verifyMessage, type Hex } from "viem";
import { sameAddress } from "./address";
import { parseCommandMessage, pullMessage, type CommandEnvelope } from "./command-message";
import { HttpError } from "./env";
import type { SnapshotPayload } from "./snapshot";
import { readUsdcUnits } from "./chain";
import { isPayoutAmount, PAYOUT_WALLET, usdcUnits } from "./payout";
import { TOPUP_TIERS_USD } from "./survival";

export interface AgentRow {
  address: string;
  name: string | null;
  creator_address: string | null;
  sandbox_id: string | null;
  added_by: string | null;
  created_at: Date;
  last_snapshot_at: Date | null;
  last_snapshot_id: string | null;
}

export interface SnapshotRow {
  id: string;
  agent_address: string;
  payload_sha256: string;
  signature: string;
  captured_at: Date;
  received_at: Date;
  survival_tier: string | null;
  credits_cents: string | null;
  turn_count: string | null;
  payload: SnapshotPayload;
}

export interface TreasuryPolicy {
  max_topup_usd: number;
  daily_topup_cap_usd: number;
  surplus_threshold_usd: number;
  updated_by: string | null;
  updated_at: Date | null;
}

export const DEFAULT_POLICY: TreasuryPolicy = {
  max_topup_usd: 25,
  daily_topup_cap_usd: 50,
  surplus_threshold_usd: 100,
  updated_by: null,
  updated_at: null,
};

export async function getAgent(sql: postgres.Sql, address: string): Promise<AgentRow> {
  const [row] = await sql<AgentRow[]>`SELECT * FROM agents WHERE address = ${address}`;
  if (!row) throw new HttpError(404, "agent not registered; add it on the fleet page first");
  return row;
}

export async function latestSnapshot(sql: postgres.Sql, address: string): Promise<SnapshotRow | null> {
  const [row] = await sql<SnapshotRow[]>`
    SELECT * FROM snapshots WHERE agent_address = ${address} ORDER BY id DESC LIMIT 1`;
  return row ?? null;
}

export async function getPolicy(sql: postgres.Sql, address: string): Promise<TreasuryPolicy> {
  const [row] = await sql<TreasuryPolicy[]>`
    SELECT max_topup_usd, daily_topup_cap_usd, surplus_threshold_usd, updated_by, updated_at
    FROM treasury_policies WHERE agent_address = ${address}`;
  return row ?? DEFAULT_POLICY;
}

export function requireCreator(agent: AgentRow, user: string): void {
  if (!agent.creator_address) throw new HttpError(409, "creator unknown until the agent pushes its first signed snapshot");
  if (!sameAddress(agent.creator_address, user)) throw new HttpError(403, "only the agent's creator address may do this");
}

/** Validates a creator-signed command against the agent, the signer and the treasury policy. */
export async function validateCommand(
  sql: postgres.Sql,
  agent: AgentRow,
  user: string,
  message: string,
  signature: string,
  expectedType: CommandEnvelope["type"],
): Promise<CommandEnvelope> {
  requireCreator(agent, user);
  const env = parseCommandMessage(message);
  if (!env) throw new HttpError(400, "malformed command message");
  if (env.type !== expectedType) throw new HttpError(400, `expected ${expectedType} command`);
  if (!sameAddress(env.agent, agent.address)) throw new HttpError(400, "command targets a different agent");
  const age = (Date.now() - Date.parse(env.issuedAt)) / 1000;
  if (!(age < 600 && age > -60)) throw new HttpError(400, "command issuedAt outside 10 min window");
  const ok = await verifyMessage({ address: user as Hex, message, signature: signature as Hex }).catch(() => false);
  if (!ok) throw new HttpError(401, "command signature does not recover to your address");
  const [dupe] = await sql`SELECT 1 FROM agent_commands WHERE agent_address = ${agent.address} AND message = ${message}`;
  if (dupe) throw new HttpError(409, "command already submitted");

  if (env.type === "topup") {
    const amount = Number(env.payload.amountUsd);
    if (!TOPUP_TIERS_USD.includes(amount as (typeof TOPUP_TIERS_USD)[number])) {
      throw new HttpError(400, `amountUsd must be one of ${TOPUP_TIERS_USD.join(", ")} (automaton topup tiers)`);
    }
    const policy = await getPolicy(sql, agent.address);
    if (amount > policy.max_topup_usd) throw new HttpError(403, `treasury policy: max single topup is $${policy.max_topup_usd}`);
    const [{ total }] = await sql<{ total: string | null }[]>`
      SELECT COALESCE(SUM((payload->>'amountUsd')::numeric), 0) AS total FROM agent_commands
      WHERE agent_address = ${agent.address} AND type = 'topup'
        AND status NOT IN ('failed','rejected') AND created_at > now() - interval '24 hours'`;
    if (Number(total) + amount > policy.daily_topup_cap_usd) {
      throw new HttpError(403, `treasury policy: 24 h topup cap $${policy.daily_topup_cap_usd} (already $${Number(total)})`);
    }
  } else if (env.type === "payout") {
    const keys = Object.keys(env.payload).sort().join(",");
    if (keys !== "amountUsd,to" || !sameAddress(String(env.payload.to), PAYOUT_WALLET)) {
      throw new HttpError(400, `payouts can only go to the fixed payout wallet ${PAYOUT_WALLET}`);
    }
    if (!isPayoutAmount(env.payload.amountUsd)) throw new HttpError(400, "amountUsd must be a positive USD amount with at most 2 decimals");
    const policy = await getPolicy(sql, agent.address);
    const balance = await readUsdcUnits(agent.address as Hex).catch(() => {
      throw new HttpError(502, "could not read the agent's USDC balance on Base");
    });
    const [{ inflight }] = await sql<{ inflight: string | null }[]>`
      SELECT COALESCE(SUM((payload->>'amountUsd')::numeric), 0) AS inflight FROM agent_commands
      WHERE agent_address = ${agent.address} AND type = 'payout' AND status IN ('pending','delivered')`;
    const surplus = balance - usdcUnits(policy.surplus_threshold_usd) - usdcUnits(Number(inflight));
    if (usdcUnits(env.payload.amountUsd) > surplus) {
      const fmt = (u: bigint) => (Number(u) / 1e6).toFixed(2);
      throw new HttpError(
        403,
        `treasury policy: payout must leave the $${policy.surplus_threshold_usd} reserve; available surplus is $${surplus > 0n ? fmt(surplus) : "0.00"} (balance $${fmt(balance)}, in flight $${Number(inflight)})`,
      );
    }
  } else if (env.type === "soul_update") {
    const content = env.payload.content;
    if (typeof content !== "string" || content.trim().length === 0 || content.length > 50_000) {
      throw new HttpError(400, "soul content must be 1-50,000 chars");
    }
  }
  return env;
}

/** Verifies the agent-signed pull header (x-omega-ts, x-omega-sig). */
export async function verifyAgentRequest(req: Request, agent: string): Promise<void> {
  const ts = Number(req.headers.get("x-omega-ts"));
  const sig = req.headers.get("x-omega-sig");
  if (!Number.isFinite(ts) || !sig) throw new HttpError(401, "missing x-omega-ts / x-omega-sig");
  if (Math.abs(Date.now() / 1000 - ts) > 300) throw new HttpError(401, "x-omega-ts outside 5 min window");
  const ok = await verifyMessage({ address: agent as Hex, message: pullMessage(agent, ts), signature: sig as Hex }).catch(() => false);
  if (!ok) throw new HttpError(401, "pull signature does not recover to agent wallet");
}
