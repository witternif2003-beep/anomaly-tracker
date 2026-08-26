import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Requested placeholders. Values stay empty in git; inject secrets at runtime. */
export const ENV_PLACEHOLDERS = [
  {
    name: "CLOUDFLARE_API_TOKEN",
    requiredFor: "Cloudflare MCP",
    closest: "CLOUDFLARE_API_TOKEN (@cloudflare/mcp-server-cloudflare, wrangler)",
  },
  {
    name: "CLOUDFLARE_ACCOUNT_ID",
    requiredFor: "Cloudflare MCP",
    closest: "CLOUDFLARE_ACCOUNT_ID (@cloudflare/mcp-server-cloudflare, wrangler)",
  },
  {
    name: "DATABASE_URI",
    requiredFor: "Postgres MCP Pro",
    closest: "DATABASE_URL (mcp-postgres / libpq)",
  },
  {
    name: "FIRECRAWL_API_KEY",
    requiredFor: "Firecrawl",
    closest: "FIRECRAWL_API_KEY (firecrawl-mcp); FIRECRAWL_OAUTH_TOKEN if using OAuth",
  },
  {
    name: "CONTEXT7_API_KEY",
    requiredFor: "Context7",
    closest: "CONTEXT7_API_KEY (@upstash/context7-mcp)",
  },
  {
    name: "OPENLAWS_API_KEY",
    requiredFor: "OpenLaws",
    closest: "OPENLAWS_API_KEY (REST client; pip openlaws is unpublished)",
  },
  {
    name: "WESTLAW_USERNAME",
    requiredFor: "Thomson Reuters Westlaw",
    closest: "WESTLAW_CLIENT_ID / WESTLAW_API_KEY (no public SDK; username/password is the requested contract login)",
  },
  {
    name: "WESTLAW_PASSWORD",
    requiredFor: "Thomson Reuters Westlaw",
    closest: "WESTLAW_CLIENT_SECRET (OAuth client credentials)",
  },
  {
    name: "LEXISNEXIS_API_KEY",
    requiredFor: "LexisNexis dev portal",
    closest: "LEXISNEXIS_API_KEY (REST stub; no public SDK on PyPI)",
  },
] as const;

export type EnvPlaceholderName = (typeof ENV_PLACEHOLDERS)[number]["name"];

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const hash = value.search(/\s+#/);
    if (hash >= 0) value = value.slice(0, hash).trim();
    out[key] = stripQuotes(value);
  }
  return out;
}

function applyFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] !== undefined && process.env[key] !== "") continue;
    process.env[key] = value;
  }
}

function applyAliases(): void {
  if (!process.env.DATABASE_URL?.trim() && process.env.DATABASE_URI?.trim()) {
    process.env.DATABASE_URL = process.env.DATABASE_URI;
  }
  if (!process.env.DATABASE_URI?.trim() && process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URI = process.env.DATABASE_URL;
  }
  if (!process.env.CLOUDFLARE_API_TOKEN?.trim() && process.env.CF_API_TOKEN?.trim()) {
    process.env.CLOUDFLARE_API_TOKEN = process.env.CF_API_TOKEN;
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID?.trim() && process.env.CF_ACCOUNT_ID?.trim()) {
    process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  }
}

export function loadEnvFiles(root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")): void {
  applyFile(path.join(root, ".env.example"));
  applyFile(path.join(root, ".env"));
  applyFile(path.join(root, ".env.local"));
  applyAliases();
}

export function envPlaceholderStatus() {
  return {
    object: "env.placeholders" as const,
    secretsInGit: false,
    note: "Placeholders only. Inject real values via Cloud Agent secrets or a gitignored .env.local.",
    variables: ENV_PLACEHOLDERS.map((item) => ({
      name: item.name,
      configured: Boolean(process.env[item.name]?.trim()),
      requiredFor: item.requiredFor,
      closest: item.closest,
    })),
  };
}
