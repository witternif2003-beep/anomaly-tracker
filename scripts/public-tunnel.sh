#!/usr/bin/env bash
# Public deploy without Vercel/Cloudflare account tokens.
# Serves Next production on :43217 and opens a Cloudflare quick tunnel.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true

PORT="${PUBLIC_PORT:-43217}"
CF="${CLOUDFLARED_BIN:-}"
if [[ -z "$CF" ]]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CF="$(command -v cloudflared)"
  elif [[ -x /tmp/cloudflared ]]; then
    CF=/tmp/cloudflared
  else
    curl -fsSL -o /tmp/cloudflared \
      https://github.com/cloudflare/cloudflared/releases/download/2025.2.1/cloudflared-linux-amd64
    chmod +x /tmp/cloudflared
    CF=/tmp/cloudflared
  fi
fi

if [[ ! -d .next ]]; then
  npm run build
fi

if ! curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/tracker"; then
  npx --no-install next start --hostname 0.0.0.0 --port "$PORT" >/tmp/lyra-public-next.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/tracker" && break
    sleep 1
  done
fi

exec "$CF" tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate
