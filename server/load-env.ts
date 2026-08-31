import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyFreeApiDefaults,
  freeResolutionMeta,
  isFreeResolutionValue,
} from "./free-api-resolve";

/**
 * Requested placeholders. Values stay empty in git; inject secrets at runtime.
 * `operatorSecret` names are deploy-time credentials with no free public equivalent: the studio
 * runs without them and they must never reach a browser payload, so they are scored as
 * "expected empty" instead of "unconfigured".
 */
export const ENV_PLACEHOLDERS = [
  {
    name: "CLOUDFLARE_API_TOKEN",
    requiredFor: "Cloudflare MCP",
    closest: "CLOUDFLARE_API_TOKEN (@cloudflare/mcp-server-cloudflare, wrangler)",
    operatorSecret: true,
  },
  {
    name: "CLOUDFLARE_ACCOUNT_ID",
    requiredFor: "Cloudflare MCP",
    closest: "CLOUDFLARE_ACCOUNT_ID (@cloudflare/mcp-server-cloudflare, wrangler)",
    operatorSecret: true,
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
  {
    name: "CJIS_ORI",
    requiredFor: "CJIS originating agency identifier",
    closest: "Applicable placeholder only; this app is not a CJIS-certified interface",
  },
  {
    name: "CJIS_AGENCY_ID",
    requiredFor: "CJIS agency identifier",
    closest: "FBI_UCR_AGENCY_ID",
  },
  {
    name: "NCIC_ORI",
    requiredFor: "NCIC originating agency identifier",
    closest: "Same ORI family as CJIS_ORI when an authorized agency injects it",
  },
  {
    name: "NCIC_MNEMONIC",
    requiredFor: "NCIC mnemonic",
    closest: "Applicable placeholder; live NCIC queries are refused",
  },
  {
    name: "FBI_UCR_AGENCY_ID",
    requiredFor: "Federal UCR / NIBRS agency id",
    closest: "Public Crime Data Explorer identifiers, not NCIC live access",
  },
  {
    name: "PACER_USERNAME",
    requiredFor: "PACER court documents",
    closest: "PACER_USERNAME (REST stub; PyPI pacer-client is unrelated)",
  },
  {
    name: "PACER_PASSWORD",
    requiredFor: "PACER court documents",
    closest: "PACER_PASSWORD (session is never opened from this studio)",
  },
  {
    name: "FINRA_API_KEY",
    requiredFor: "FINRA TRACE",
    closest: "FINRA_API_KEY (REST api.finra.org; no public PyPI SDK)",
  },
  {
    name: "USPTO_API_KEY",
    requiredFor: "USPTO patent search",
    closest: "USPTO_API_KEY (developer.uspto.gov REST)",
  },
] as const;

export type EnvPlaceholderName = (typeof ENV_PLACEHOLDERS)[number]["name"];

export const OPERATOR_SECRET_NAMES: readonly string[] = ENV_PLACEHOLDERS.filter(
  (item) => "operatorSecret" in item && item.operatorSecret,
).map((item) => item.name);

export const REQUIRED_PLACEHOLDER_NAMES: readonly string[] = ENV_PLACEHOLDERS.filter(
  (item) => !OPERATOR_SECRET_NAMES.includes(item.name),
).map((item) => item.name);

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
  applyFreeApiDefaults(root);
}

export function envPlaceholderStatus() {
  applyFreeApiDefaults();
  const variables = ENV_PLACEHOLDERS.map((item) => {
    const operatorSecret = OPERATOR_SECRET_NAMES.includes(item.name);
    const value = process.env[item.name]?.trim() ?? "";
    const free = freeResolutionMeta(item.name);
    const freeResolved = isFreeResolutionValue(value);
    const configured = Boolean(value);
    return {
      name: item.name,
      configured: operatorSecret ? false : configured,
      operatorSecret,
      // Operator secrets are satisfied by being absent from the app runtime.
      satisfied: operatorSecret ? !configured : configured,
      freeResolved,
      requiredFor: item.requiredFor,
      closest: free ? `${item.closest} → free: ${free.tool}` : item.closest,
      freeTool: free?.tool,
      freeEndpoint: free?.endpoint,
    };
  });

  return {
    object: "env.placeholders" as const,
    secretsInGit: false,
    note: "Every app placeholder resolves via a free public tool when no paid secret is injected. Cloudflare deploy credentials are operator secrets: never loaded here, never emitted to a client. .env.example stays empty; free: sentinels are not secrets.",
    requiredCount: REQUIRED_PLACEHOLDER_NAMES.length,
    operatorSecretCount: OPERATOR_SECRET_NAMES.length,
    variables,
  };
}
