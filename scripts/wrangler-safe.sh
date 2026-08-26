#!/usr/bin/env bash
# Cloudflare wrapper: live deploy is refused. Dry-run is the only allowed deploy path.
set -euo pipefail
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${PATH}"

if [[ "$*" == *deploy* && "$*" != *--dry-run* ]]; then
  echo "REFUSED: live Cloudflare deployment is disabled. Pass --dry-run." >&2
  exit 1
fi
if [[ "$*" == *pages\ deploy* && "$*" != *--dry-run* ]]; then
  echo "REFUSED: live Cloudflare Pages deploy is disabled." >&2
  exit 1
fi
exec wrangler "$@"
