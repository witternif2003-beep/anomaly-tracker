#!/usr/bin/env bash
# Assert env placeholders exist, stay empty in git, and are wired to MCP/clients.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

python3 - <<'PY'
from pathlib import Path
import json, re, sys

example = Path(".env.example").read_text()
required = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "DATABASE_URI",
    "FIRECRAWL_API_KEY",
    "CONTEXT7_API_KEY",
    "OPENLAWS_API_KEY",
    "WESTLAW_USERNAME",
    "WESTLAW_PASSWORD",
    "LEXISNEXIS_API_KEY",
]
missing = [name for name in required if not re.search(rf"^{re.escape(name)}=", example, re.M)]
if missing:
    raise SystemExit(f"ENV FAIL: .env.example missing {missing}")

leaked = []
for name in required:
    for match in re.finditer(rf"^{re.escape(name)}=(.*)$", example, re.M):
        raw = match.group(1)
        value = re.sub(r"\s+#.*$", "", raw).strip().strip("\"'")
        if value:
            leaked.append(name)
if leaked:
    raise SystemExit(f"ENV FAIL: placeholders must be empty in git: {leaked}")

mcp = json.loads(Path(".cursor/mcp.json").read_text())["mcpServers"]
checks = {
    "cloudflare": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    "cloudflare-code-mode": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    "firecrawl": ["FIRECRAWL_API_KEY"],
    "postgres-mcp-pro": ["DATABASE_URI"],
    "context7": ["CONTEXT7_API_KEY"],
}
for server, keys in checks.items():
    env = mcp[server].get("env") or {}
    for key in keys:
        blob = json.dumps(env)
        if key not in blob:
            raise SystemExit(f"ENV FAIL: mcp.json {server} missing {key}")

clients = Path("server/legal/clients.ts").read_text()
for needle in ("OPENLAWS_API_KEY", "WESTLAW_USERNAME", "WESTLAW_PASSWORD", "LEXISNEXIS_API_KEY"):
    if needle not in clients:
        raise SystemExit(f"ENV FAIL: legal client missing {needle}")

print("PIPELINE OK env-placeholders", len(required), "empty names wired")
PY
