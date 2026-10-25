// Shared by browser and server: the exact text a creator signs for a command.
export type CommandType = "topup" | "soul_update" | "payout";

export interface CommandEnvelope {
  agent: string;
  type: CommandType;
  payload: Record<string, unknown>;
  nonce: string;
  issuedAt: string;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export function buildCommandMessage(c: CommandEnvelope): string {
  return [
    "Omega control plane command (v1)",
    `agent: ${c.agent}`,
    `type: ${c.type}`,
    `payload: ${stable(c.payload)}`,
    `nonce: ${c.nonce}`,
    `issuedAt: ${c.issuedAt}`,
  ].join("\n");
}

export function parseCommandMessage(message: string): CommandEnvelope | null {
  const lines = message.split("\n");
  if (lines.length !== 6 || lines[0] !== "Omega control plane command (v1)") return null;
  const field = (i: number, key: string) => (lines[i].startsWith(`${key}: `) ? lines[i].slice(key.length + 2) : null);
  const agent = field(1, "agent");
  const type = field(2, "type");
  const payloadRaw = field(3, "payload");
  const nonce = field(4, "nonce");
  const issuedAt = field(5, "issuedAt");
  if (!agent || !type || !payloadRaw || !nonce || !issuedAt) return null;
  if (type !== "topup" && type !== "soul_update" && type !== "payout") return null;
  try {
    const payload = JSON.parse(payloadRaw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const env: CommandEnvelope = { agent, type, payload, nonce, issuedAt };
    return buildCommandMessage(env) === message ? env : null;
  } catch {
    return null;
  }
}

export const snapshotMessage = (payloadSha256: string) => `omega-snapshot:v1:${payloadSha256}`;
export const pullMessage = (agent: string, ts: number) => `omega-pull:v1:${agent.toLowerCase()}:${ts}`;
export const ackMessage = (payloadSha256: string) => `omega-ack:v1:${payloadSha256}`;
