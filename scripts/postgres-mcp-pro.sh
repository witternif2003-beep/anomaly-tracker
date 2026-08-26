#!/usr/bin/env bash
# Crystal DBA Postgres MCP Pro (PyPI postgres-mcp). DATABASE_URI is optional so
# the server can be configured before secrets are injected.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"
uri="${DATABASE_URI:-${DATABASE_URL:-}}"
if [[ -n "$uri" ]]; then
  exec postgres-mcp --access-mode restricted "$uri"
fi
exec postgres-mcp --access-mode restricted
