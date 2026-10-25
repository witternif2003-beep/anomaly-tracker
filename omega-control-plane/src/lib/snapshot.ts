import { verifyMessage, type Hex } from "viem";
import { z } from "zod";
import { normalizeAddress } from "./address";
import { snapshotMessage } from "./command-message";
import { env, HttpError } from "./env";
import { sha256Hex } from "./hash";
import { survivalTier, SURVIVAL_TIERS } from "./survival";

const rows = z.array(z.record(z.string(), z.unknown())).max(2000).optional();

export const SnapshotPayload = z.object({
  v: z.literal(1),
  agentAddress: z.string(),
  capturedAt: z.string().datetime(),
  source: z.object({ tool: z.string(), version: z.string(), dbPath: z.string().optional() }),
  config: z.object({
    name: z.string().max(200).optional(),
    walletAddress: z.string().optional(),
    creatorAddress: z.string().optional(),
    sandboxId: z.string().max(200).optional(),
    inferenceModel: z.string().max(200).optional(),
    version: z.string().max(50).optional(),
  }),
  creditsCents: z.number().int().nullable(),
  creditsSource: z.string().max(200),
  survivalTier: z.enum(SURVIVAL_TIERS).nullable(),
  agentState: z.string().max(50).nullable(),
  turnCount: z.number().int().nonnegative(),
  kv: z.record(z.string(), z.string().max(20_000)).optional(),
  soul: z.object({ content: z.string().max(100_000).nullable(), history: rows }).optional(),
  tables: z.record(z.string(), rows).default({}),
  aggregates: z.record(z.string(), rows).default({}),
  missingTables: z.array(z.string()).default([]),
});
export type SnapshotPayload = z.infer<typeof SnapshotPayload>;

export const SignedSnapshot = z.object({
  payload: z.string().min(2).max(4_000_000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export interface VerifiedSnapshot {
  agent: `0x${string}`;
  payload: SnapshotPayload;
  payloadSha256: string;
  signature: Hex;
  tier: string | null;
}

/** Verifies an EIP-191 signature by the agent wallet over sha256(payload), freshness and shape. */
export async function verifySignedSnapshot(body: unknown, urlAgent: string, now = Date.now()): Promise<VerifiedSnapshot> {
  const signed = SignedSnapshot.safeParse(body);
  if (!signed.success) throw new HttpError(400, "expected {payload, signature}");
  let raw: unknown;
  try {
    raw = JSON.parse(signed.data.payload);
  } catch {
    throw new HttpError(400, "payload is not JSON");
  }
  const parsed = SnapshotPayload.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, `invalid snapshot: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  const agent = normalizeAddress(urlAgent);
  if (normalizeAddress(parsed.data.agentAddress) !== agent) throw new HttpError(400, "agentAddress does not match URL");
  const payloadSha256 = sha256Hex(signed.data.payload);
  const signature = signed.data.signature as Hex;
  const ok = await verifyMessage({ address: agent, message: snapshotMessage(payloadSha256), signature }).catch(() => false);
  if (!ok) throw new HttpError(401, "signature does not recover to agent wallet");
  const ageSec = (now - Date.parse(parsed.data.capturedAt)) / 1000;
  if (ageSec > env.maxSnapshotAgeSec || ageSec < -60) throw new HttpError(400, `snapshot capturedAt outside freshness window (${Math.round(ageSec)} s)`);
  const tier = parsed.data.creditsCents != null ? survivalTier(parsed.data.creditsCents) : parsed.data.survivalTier;
  return { agent, payload: parsed.data, payloadSha256, signature, tier };
}
