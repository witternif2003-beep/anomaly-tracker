import { isIP } from "node:net";

/** Result of validating a caller-supplied fetch target. */
export type SafeUrlResult =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: string };

const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fe80") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

/**
 * Validate a caller-supplied URL before any server-side fetch: https/http only, no credentials,
 * no default ports other than 80/443, and no loopback, link-local, private or cloud-metadata host.
 * DNS is not resolved here, so a hostname that resolves to a private address still needs an
 * egress allowlist upstream; this closes the direct-literal and scheme-abuse paths.
 */
export function assertSafeFetchUrl(raw: string): SafeUrlResult {
  const candidate = raw.trim();
  if (!candidate) return { ok: false, reason: "url is required" };
  if (candidate.length > MAX_URL_LENGTH) return { ok: false, reason: "url is too long" };

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate) ? candidate : `https://${candidate}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "url is not a valid absolute URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "only http and https URLs are allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "credentials in the url are not allowed" };
  }
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") {
    return { ok: false, reason: "only ports 80 and 443 are allowed" };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "url has no host" };
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, reason: "internal hosts are not allowed" };
  }

  const family = isIP(host.replace(/^\[|\]$/g, ""));
  if (family === 4 && isPrivateIpv4(host)) {
    return { ok: false, reason: "private and loopback addresses are not allowed" };
  }
  if (family === 6 && isPrivateIpv6(host)) {
    return { ok: false, reason: "private and loopback addresses are not allowed" };
  }
  if (family === 0 && !host.includes(".")) {
    return { ok: false, reason: "unqualified hostnames are not allowed" };
  }

  return { ok: true, url: parsed.toString(), host };
}
