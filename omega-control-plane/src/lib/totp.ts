import { createHmac } from "node:crypto";

// RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits) over RFC 4226 HOTP dynamic truncation.
export const TOTP_STEP_SEC = 30;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (unixSec: number) => Math.floor(unixSec / TOTP_STEP_SEC);

export function totpCode(secretB32: string, unixSec = Date.now() / 1000, digits = 6): string {
  return hotp(base32Decode(secretB32), totpStep(unixSec), digits);
}

/** Returns the matched time step within ±window steps (clock drift), or null. */
export function verifyTotp(secretB32: string, code: string, unixSec = Date.now() / 1000, window = 1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const now = totpStep(unixSec);
  for (let d = -window; d <= window; d++) if (hotp(key, now + d) === code) return now + d;
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer = "Omega control plane"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SEC}`;
}
