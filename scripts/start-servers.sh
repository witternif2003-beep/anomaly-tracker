#!/usr/bin/env bash
# Foreground process is the local Express API on :4040.
# Next.js studio stays available on :43127 when START_NEXT=1 (default).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
# shellcheck disable=SC1091
. "$root/scripts/load-env.sh"

if [[ "${START_NEXT:-1}" == "1" ]]; then
  npm run dev &
fi

exec npx --no-install tsx server/index.ts
