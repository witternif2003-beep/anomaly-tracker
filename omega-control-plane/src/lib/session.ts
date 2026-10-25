import { cookies } from "next/headers";
import { HttpError, sessionSecret } from "./env";
import { hmacB64url, safeEqual } from "./hash";

const SESSION_COOKIE = "omega_session";
const NONCE_COOKIE = "omega_nonce";
const SESSION_TTL_SEC = 60 * 60 * 12;
const NONCE_TTL_SEC = 60 * 10;

type Signed<T> = T & { exp: number };

export function signToken<T extends object>(data: T, ttlSec: number, secret = sessionSecret()): string {
  const body = Buffer.from(
    JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + ttlSec }),
  ).toString("base64url");
  return `${body}.${hmacB64url(secret, body)}`;
}

export function verifyToken<T extends object>(token: string | undefined, secret = sessionSecret()): Signed<T> | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || !safeEqual(mac, hmacB64url(secret, body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Signed<T>;
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge,
});

export async function issueNonce(nonce: string): Promise<void> {
  (await cookies()).set(NONCE_COOKIE, signToken({ nonce }, NONCE_TTL_SEC), cookieOpts(NONCE_TTL_SEC));
}

export async function consumeNonce(): Promise<string | null> {
  const jar = await cookies();
  const data = verifyToken<{ nonce: string }>(jar.get(NONCE_COOKIE)?.value);
  jar.delete(NONCE_COOKIE);
  return data?.nonce ?? null;
}

export async function startSession(address: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signToken({ address }, SESSION_TTL_SEC), cookieOpts(SESSION_TTL_SEC));
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken<{ address: string }>(token)?.address ?? null;
}

export async function requireUser(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "sign in with Ethereum first");
  return user;
}
