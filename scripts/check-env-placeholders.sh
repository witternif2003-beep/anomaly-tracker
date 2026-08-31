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
    "CJIS_ORI",
    "CJIS_AGENCY_ID",
    "NCIC_ORI",
    "NCIC_MNEMONIC",
    "FBI_UCR_AGENCY_ID",
    "PACER_USERNAME",
    "PACER_PASSWORD",
    "FINRA_API_KEY",
    "USPTO_API_KEY",
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

free = Path("data/anomaly/free-api-resolutions.json")
if not free.exists():
    raise SystemExit("ENV FAIL: missing data/anomaly/free-api-resolutions.json")
doc = json.loads(free.read_text())
resolutions = doc.get("resolutions") or {}
# Cloudflare stays operator-secret; every other placeholder must have a free resolution.
need_free = [n for n in required if n not in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")]
missing_free = [n for n in need_free if n not in resolutions]
if missing_free:
    raise SystemExit(f"ENV FAIL: free-api-resolutions missing {missing_free}")
resolve_mod = Path("server/free-api-resolve.ts").read_text()
for needle in ("applyFreeApiDefaults", "searchCourtListenerFree", "searchGooglePatents", "fetchViaJina", "fetchFbiCdeAgencies"):
    if needle not in resolve_mod:
        raise SystemExit(f"ENV FAIL: free-api-resolve missing {needle}")
print("PIPELINE OK free-api-resolutions", len(need_free), "mapped")

operator_secrets = ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID")
loader = Path("server/load-env.ts").read_text()
for name in operator_secrets:
    block = re.search(rf'name: "{name}".*?\}}', loader, re.S)
    if not block or "operatorSecret: true" not in block.group(0):
        raise SystemExit(f"ENV FAIL: {name} must be marked operatorSecret in server/load-env.ts")
for name in required:
    if name in operator_secrets:
        continue
    block = re.search(rf'name: "{name}".*?\}}', loader, re.S)
    if block and "operatorSecret" in block.group(0):
        raise SystemExit(f"ENV FAIL: {name} is free-resolvable and must not be an operatorSecret")

# The static bake is world-readable: operator secrets must never be reported as configured there.
bake = Path("public/static/anomaly.json")
if bake.exists():
    credentials = json.loads(bake.read_text()).get("credentials") or {}
    variables = {v["name"]: v for v in credentials.get("variables", [])}
    for name in operator_secrets:
        var = variables.get(name)
        if var is None:
            raise SystemExit(f"ENV FAIL: bake missing credential badge {name}")
        if var.get("operatorSecret") is not True:
            raise SystemExit(f"ENV FAIL: bake must mark {name} operatorSecret")
        if var.get("configured") is not False:
            raise SystemExit(f"ENV FAIL: bake leaks operator secret state for {name}")
    unsatisfied = [v["name"] for v in credentials.get("variables", []) if v.get("satisfied") is False]
    if unsatisfied:
        raise SystemExit(f"ENV FAIL: unsatisfied credential badges in bake: {unsatisfied}")
    if credentials.get("requiredCount") != len(need_free):
        raise SystemExit(
            f"ENV FAIL: bake requiredCount={credentials.get('requiredCount')} expected {len(need_free)}"
        )
print("PIPELINE OK operator-secret-classification", len(operator_secrets), "held outside the app")
PY
