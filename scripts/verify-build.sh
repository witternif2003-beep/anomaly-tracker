#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

fail() { echo "VERIFY FAIL: $*" >&2; exit 1; }
ok() { echo "VERIFY OK: $*"; }

test -f package.json || fail "missing package.json"
test -f package-lock.json || fail "missing package-lock.json"
test -d node_modules || fail "missing node_modules; run npm ci"
command -v node >/dev/null || fail "node is not on PATH"
command -v npm >/dev/null || fail "npm is not on PATH"

ok "repository files and lockfile present"
ok "node $(node -v) npm $(npm -v)"

required_names=( )
optional_names=(
  CONVERSATION_PROJECT_ID
  CONVERSATION_KEY_ID
  CONVERSATION_KEY_SECRET
  CONVERSATION_REGION
  CONVERSATION_APP_ID
)

for name in "${required_names[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    fail "required credential ${name} is not set (inject via Cloud Agent secrets or the environment, never git)"
  fi
  ok "required credential ${name} is set (value not printed)"
done

if [[ "${VERIFY_OPTIONAL_MCP:-0}" == "1" ]]; then
  for name in "${optional_names[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      echo "VERIFY WARN: optional MCP credential ${name} is unset"
    else
      ok "optional MCP credential ${name} is set (value not printed)"
    fi
  done
fi

npx --no-install tsc --noEmit
ok "typescript"

npx --no-install eslint src --max-warnings=0
ok "eslint"

base="${VERIFY_BASE_URL:-http://127.0.0.1:43127}"
if curl -fsS -o /dev/null --max-time 3 "${base}/"; then
  payload='{"input":"write a launch email for our headphones","mode":"basic","requestType":"auto","platform":"chatgpt"}'
  body="$(curl -fsS --max-time 10 -H "Content-Type: application/json" -d "${payload}" "${base}/api/optimize")"
  echo "${body}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('status')=='complete' and d.get('optimizedPrompt'); print('VERIFY OK: optimize API', d['status'], len(d['optimizedPrompt']), 'chars')"
else
  echo "VERIFY WARN: ${base} is not up; skipped live API check"
fi

ok "build verify finished"
