import { cookies } from "next/headers";
import { env, HttpError, sessionSecret } from "./env";
import { hmacB64url, safeEqual, sha256Hex } from "./hash";
import { SESSION_COOKIE } from "./constants";

export interface Principal {
  actor: string;
  operator: boolean;
}

const SESSION_TTL_SEC = 60 * 60 * 8;

export function signToken<T extends object>(data: T, ttlSec: number, secret = sessionSecret()): string {
  const body = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString("base64url");
  return `${body}.${hmacB64url(secret, body)}`;
}

export function verifyToken<T extends object>(token: string | undefined, secret = sessionSecret()): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || !safeEqual(mac, hmacB64url(secret, body))) return null;
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

export async function startSession(actor: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signToken({ actor }, SESSION_TTL_SEC), {
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

export async function principal(req?: Request): Promise<Principal> {
  const auth = req?.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ") && env.cronSecret.length >= 16 && safeEqual(auth.slice(7).trim(), env.cronSecret)) {
    return { actor: "scheduler", operator: true };
  }
  if (env.sessionSecret.length >= 32) {
    const data = verifyToken<{ actor: string }>((await cookies()).get(SESSION_COOKIE)?.value);
    if (data) return { actor: data.actor, operator: true };
  }
  return { actor: "anonymous", operator: false };
}

export async function requireOperator(req?: Request): Promise<Principal> {
  const p = await principal(req);
  if (!p.operator) throw new HttpError(401, "operator sign-in required");
  return p;
}
