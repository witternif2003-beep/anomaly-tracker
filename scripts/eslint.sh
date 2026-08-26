#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node --require "${root}/scripts/eslint-ts6-alias.cjs" "${root}/node_modules/eslint/bin/eslint.js" "$@"
