#!/usr/bin/env bash
# Cloudflare CI gate — dry-run only. Never deploys.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
# shellcheck disable=SC1091
. "$root/scripts/load-env.sh"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:$PATH"

test -f workers/ci-gate.js
test -f workers/wrangler.toml

"$root/scripts/wrangler-safe.sh" deploy --dry-run --config workers/wrangler.toml
echo "PIPELINE OK cloudflare-ci dry-run"
