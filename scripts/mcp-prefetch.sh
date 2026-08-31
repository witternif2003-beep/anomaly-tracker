#!/usr/bin/env bash
# Warm the npm cache with every npm-launched MCP server *and its transitive
# dependencies* so the first IDE start does not stall on downloads. Package specs
# are read from .cursor/mcp.json rather than duplicated here, so a new server is
# prefetched without editing this script. Each package is then re-installed with
# --offline into a clean prefix to prove npx can materialise it without network.
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

stage="$(mktemp -d)"
verify="$(mktemp -d)"
trap 'rm -rf "$stage" "$verify"' EXIT

install_into() {
  local prefix="$1" pkg="$2"
  shift 2
  rm -rf "$prefix/node_modules" "$prefix/package-lock.json"
  npm install --silent --prefix "$prefix" --no-audit --no-fund --no-save \
    --ignore-scripts "$@" "$pkg" >/dev/null
}

failed=()
for pkg in "${packages[@]}"; do
  echo "  -> $pkg"
  # Populate the npm cache with the whole dependency tree; `npm pack` would only
  # cache this package's own tarball, leaving npx to fetch its deps at runtime.
  install_into "$stage" "$pkg"
  # Then prove the cache is sufficient: a clean install with the network refused
  # is what npx has to do on first launch.
  if ! install_into "$verify" "$pkg" --offline --prefer-offline; then
    failed+=("$pkg")
  fi
done

if ((${#failed[@]})); then
  echo "MCP PREFETCH FAIL offline install failed: ${failed[*]}" >&2
  exit 1
fi

echo "MCP PREFETCH OK ${#packages[@]} packages cached and verified offline"
