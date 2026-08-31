#!/usr/bin/env bash
# Warm the npx cache for every npm-launched MCP server so first IDE start does not
# stall on a download. Package specs are read from .cursor/mcp.json rather than
# duplicated here, so a new server is prefetched without editing this script.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${HOME}/.local/bin:${PATH}"

mapfile -t packages < <(python3 - <<'PY'
import json
from pathlib import Path

specs = []
for name, server in json.loads(Path(".cursor/mcp.json").read_text())["mcpServers"].items():
    if server.get("command") != "npx":
        continue
    for arg in server.get("args", []):
        # First non-flag arg after `-y` is the package spec; later args are the
        # server's own options (URLs, --stdio, ...).
        if arg.startswith("-"):
            continue
        if arg.startswith("http"):
            break
        specs.append(arg)
        break
print("\n".join(dict.fromkeys(specs)))
PY
)

for pkg in "${packages[@]}"; do
  echo "  -> $pkg"
  # Servers speak stdio and have no uniform --help, so cache the tarball instead
  # of launching them.
  npm pack --silent --pack-destination "$(mktemp -d)" "$pkg" >/dev/null
done

echo "MCP PREFETCH OK ${#packages[@]} packages cached"
