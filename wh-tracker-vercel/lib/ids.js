import { createHash } from "node:crypto";

export function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Slug plus a digest of the full value, so truncated names keep distinct ids. */
export function stableKey(value) {
  const digest = createHash("sha1").update(String(value)).digest("hex").slice(0, 8);
  return `${slug(value)}-${digest}`;
}
