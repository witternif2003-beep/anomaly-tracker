#!/usr/bin/env bash
# Research-note §6.1 "install-all.sh" — safe Lyra entrypoint.
# Does NOT npm-install unpublished @law-research / westlaw-mcp / etc.
# Does NOT docker-pull or start Cuckoo live. Closest installs only.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

echo "=== Lyra install-all (closest public assets) ==="
echo "Rejected from research note: unpublished scoped npm, westlaw/lexis MCP,"
echo "apache-flink JVM stack, live Cuckoo sandbox, TheHive/OpenCTI/MISP full deploys."
echo

if [[ "${1:-}" == "--after-core" ]]; then
  bash "$root/scripts/install-one-shot.sh" --after-core
else
  bash "$root/scripts/install-toolchain.sh"
fi
bash "$root/scripts/verify-dependencies.sh"
bash "$root/scripts/audit-mcp.sh"

echo
echo "INSTALL-ALL OK — use npm run inventory:install / mcp:install for refreshes."
echo "P1 Tier-1 slots remain generated (11,280). Cuckoo live sandbox stays off."
