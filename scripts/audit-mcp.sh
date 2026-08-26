#!/usr/bin/env bash
# Audit research-note §4 MCP wishlist against .cursor/mcp.json + install-mcp.sh.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${HOME}/.local/bin:${PATH}"

python3 - <<'PY'
import json
from pathlib import Path

cfg = json.loads(Path(".cursor/mcp.json").read_text())
audit = json.loads(Path("data/anomaly/mcp-audit.json").read_text())
servers = cfg["mcpServers"]
wired = set(servers)

assert "github" not in {k.lower() for k in wired}, "GitHub MCP must stay removed"
assert len(wired) >= audit["wiredCountExpected"], (len(wired), audit["wiredCountExpected"])

banned = set(audit["wontAddToMcpJson"])
assert not (banned & wired), sorted(banned & wired)

ok = 0
for row in audit["rows"]:
    wid = row.get("wiredId")
    status = row["status"]
    if wid:
        assert wid in servers, f"missing wired MCP {wid}"
        print(f"MCP OK  {row['requested']} → {wid} ({row['closestPackage']}) [{status}]")
        ok += 1
    else:
        assert status in {"closest-not-mcp-entry", "rest-stub", "wont-do"}, status
        print(f"MCP MAP {row['requested']} → {row['closestPackage']} [{status}]")
        ok += 1

# Binary probes for key installs
from shutil import which
probes = {
    "folio-mcp": "folio",
    "firecrawl-mcp": "firecrawl",
    "context7-mcp": "context7",
    "amplitude-mcp": "amplitude",
}
for bin_name, label in probes.items():
    path = which(bin_name)
    assert path, f"{bin_name} not on PATH — run npm run mcp:install"
    print(f"MCP BIN {label}: {path}")

out = {
    "object": "lyra.mcp-audit.result",
    "wiredServers": sorted(wired),
    "wiredCount": len(wired),
    "rowsChecked": ok,
    "bannedAbsent": sorted(banned),
    "installCommand": audit["installCommand"],
}
Path("data/anomaly/mcp-audit-status.json").write_text(json.dumps(out, indent=2) + "\n")
print(f"MCP AUDIT OK {len(wired)} wired, {ok} rows checked")
PY
