import { cookies } from "next/headers";
import { db } from "./db";
import { env, HttpError, sessionSecret } from "./env";
import { hmacB64url, safeEqual, sha256Hex } from "./hash";

export type Role = "viewer" | "operator" | "admin";
const RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 };

export interface Principal {
  actor: string;
  role: Role;
  via: "session" | "api_key" | "cron" | "anonymous";
}

const SESSION_COOKIE = "omega_ops_session";
const SESSION_TTL_SEC = 60 * 60 * 8;

export function signToken<T extends object>(data: T, ttlSec: number): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString("base64url");
  return `${body}.${hmacB64url(sessionSecret(), body)}`;
}

export function verifyToken<T extends object>(token: string | undefined): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || !safeEqual(mac, hmacB64url(sessionSecret(), body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

export function passphraseOk(candidate: string): boolean {
  if (env.operatorPassphrase.length < 12) throw new HttpError(503, "OPERATOR_PASSPHRASE is not configured (min 12 chars)");
  return safeEqual(sha256Hex(candidate), sha256Hex(env.operatorPassphrase));
}

export async function startSession(actor: string, role: Role): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signToken({ actor, role }, SESSION_TTL_SEC), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export function hashApiKey(key: string): string {
  return sha256Hex(`omega-ops:${key}`);
}

/** Resolves the caller from a bearer API key, the cron secret, or the session cookie. */
export async function principal(req?: Request): Promise<Principal> {
  const auth = req?.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (env.cronSecret.length >= 16 && safeEqual(token, env.cronSecret)) return { actor: "scheduler", role: "operator", via: "cron" };
    const s = await db();
    const [row] = await s<{ id: string; name: string; role: Role }[]>`
      UPDATE ops_api_key SET last_used_at = now()
      WHERE key_hash = ${hashApiKey(token)} AND revoked_at IS NULL
      RETURNING id, name, role`;
    if (!row) throw new HttpError(401, "invalid or revoked API key");
    return { actor: `key:${row.name}`, role: row.role, via: "api_key" };
  }
  if (env.sessionSecret.length >= 32) {
    const data = verifyToken<{ actor: string; role: Role }>((await cookies()).get(SESSION_COOKIE)?.value);
    if (data) return { actor: data.actor, role: data.role, via: "session" };
  }
  return { actor: "anonymous", role: "viewer", via: "anonymous" };
}

export async function requireRole(req: Request | undefined, role: Role): Promise<Principal> {
  const p = await principal(req);
  if (RANK[p.role] < RANK[role]) {
    throw new HttpError(p.via === "anonymous" ? 401 : 403, p.via === "anonymous" ? "sign in required" : `${role} role required`);
  }
  return p;
}
