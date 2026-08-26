#!/usr/bin/env bash
# Install closest available MCP servers. Requested scoped names that are not on
# npm are replaced below. Never writes secrets; env placeholders live in
# .cursor/mcp.json and .env.example.
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${HOME}/.local/bin:${PATH}"

npm install -g \
  amplitude-mcp@0.0.2 \
  figma-developer-mcp@0.13.2 \
  @tacticlaunch/mcp-linear@1.4.2 \
  @stripe/mcp@0.3.3 \
  @cloudflare/mcp-server-cloudflare@0.2.0 \
  @playwright/mcp@0.0.79 \
  firecrawl-mcp@3.24.0 \
  mcp-postgres@1.3.0 \
  @sentry/mcp-server@0.37.0 \
  mcp-server-kubernetes@4.1.4 \
  @chinchillaenterprises/mcp-slack@4.14.0 \
  @upstash/context7-mcp@4.0.3 \
  mcp-remote@0.2.5 \
  folio-mcp@0.4.1 \
  @teolin/mcp-cloudwatch-logs@3.3.9

python3 -m pip install --user --quiet 'mcp<2' 'postgres-mcp==0.3.0'

echo "MCP INSTALL OK"
command -v amplitude-mcp
command -v cloudwatch-mcp
command -v figma-developer-mcp
command -v mcp-linear
command -v playwright-mcp
command -v firecrawl-mcp
command -v postgres-mcp
command -v sentry-mcp
command -v mcp-server-kubernetes
command -v mcp-slack
command -v context7-mcp
command -v folio-mcp
command -v mcp-remote
