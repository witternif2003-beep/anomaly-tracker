#!/usr/bin/env bash
# GitHub Actions and GitHub MCP are removed. Cloudflare scripts/MCP are the replacement.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

if [[ -d .github/workflows ]]; then
  echo "POLICY FAIL: .github/workflows must not exist (GitHub Actions removed)" >&2
  exit 1
fi
python3 - <<'PY'
import json
from pathlib import Path
servers = json.loads(Path(".cursor/mcp.json").read_text())["mcpServers"]
banned = [k for k in servers if k.lower() in {"github", "github-mcp", "@github/mcp"}]
assert not banned, banned
assert "cloudflare" in servers and "cloudflare-code-mode" in servers
print("PIPELINE OK no-github-actions Cloudflare MCP present, GitHub MCP absent")
PY
test -f scripts/pipelines/cloudflare-ci.sh
test -f scripts/wrangler-safe.sh
echo "PIPELINE OK github-removed cloudflare-replacement"
