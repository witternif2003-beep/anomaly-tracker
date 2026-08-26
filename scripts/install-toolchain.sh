#!/usr/bin/env bash
# Install the pinned Lyra runtime: Node 22.14.0, npm 10.9.7, lockfile packages,
# Playwright Chromium, folio-mcp, and Wrangler 4.x (CLI only — never deploy).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

NODE_VERSION="22.14.0"
NPM_VERSION="10.9.7"
FOLIO_MCP_VERSION="0.4.1"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use "$NODE_VERSION"

export PATH="$NVM_DIR/versions/node/v${NODE_VERSION}/bin:$PATH"

npm install -g "npm@${NPM_VERSION}"

test -f package.json
test -f package-lock.json
npm ci

npx --no-install playwright install chromium

npm install -g "folio-mcp@${FOLIO_MCP_VERSION}"
npm install -g wrangler@4
bash scripts/install-mcp.sh
bash scripts/install-extensions.sh
bash scripts/install-p1-inventory.sh

npx --no-install next typegen

echo "TOOLCHAIN OK node $(node -v) npm $(npm -v) tsc $(npx --no-install tsc --version) eslint $(npx --no-install eslint --version) playwright $(npx --no-install playwright --version) wrangler $(wrangler --version) folio-mcp $(command -v folio-mcp)"
