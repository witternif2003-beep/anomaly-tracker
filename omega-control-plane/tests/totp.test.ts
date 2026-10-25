import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, otpauthUri, totpCode, verifyTotp } from "../src/lib/totp";

// RFC 4226 Appendix D and RFC 6238 Appendix B (SHA-1) test vectors, secret "12345678901234567890".
const key = Buffer.from("12345678901234567890", "ascii");
const b32 = base32Encode(key);

describe("TOTP", () => {
  it("matches RFC 4226 HOTP vectors", () => {
    expect([0, 1].map((c) => hotp(key, c))).toEqual(["755224", "287082"]);
  });
  it("matches RFC 6238 SHA-1 vectors (8 digits)", () => {
    const v: [number, string][] = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
    for (const [t, code] of v) expect(totpCode(b32, t, 8)).toBe(code);
  });
  it("round-trips base32", () => {
    expect(base32Decode(b32).equals(key)).toBe(true);
    expect(b32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });
  it("accepts ±1 step and rejects others", () => {
    const t = 1_800_000_000;
    expect(verifyTotp(b32, totpCode(b32, t - 30), t)).toBe(Math.floor(t / 30) - 1);
    expect(verifyTotp(b32, totpCode(b32, t + 30), t)).toBe(Math.floor(t / 30) + 1);
    expect(verifyTotp(b32, totpCode(b32, t + 90), t)).toBeNull();
    expect(verifyTotp(b32, "12345", t)).toBeNull();
  });
  it("builds an otpauth URI", () => {
    expect(otpauthUri(b32, "0xabc")).toMatch(/^otpauth:\/\/totp\/Omega%20control%20plane%3A0xabc\?secret=GEZ.*&period=30$/);
  });
});
