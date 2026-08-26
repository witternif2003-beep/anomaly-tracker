#!/usr/bin/env bash
# Assert env placeholders exist, stay empty in git, and are wired to MCP/clients.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
bash scripts/check-env-placeholders.sh
