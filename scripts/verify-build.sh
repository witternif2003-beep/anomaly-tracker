#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
# shellcheck disable=SC1091
. "$root/scripts/load-env.sh"

fail() { echo "VERIFY FAIL: $*" >&2; exit 1; }
ok() { echo "VERIFY OK: $*"; }

expect() {
  local label="$1" actual="$2" wanted="$3"
  [[ "$actual" == "$wanted" ]] || fail "${label} is ${actual}, expected ${wanted}"
  ok "${label} ${actual}"
}

test -f package.json || fail "missing package.json"
test -f package-lock.json || fail "missing package-lock.json"
test -d node_modules || fail "missing node_modules; run npm ci or bash scripts/install-toolchain.sh"
command -v node >/dev/null || fail "node is not on PATH"
command -v npm >/dev/null || fail "npm is not on PATH"

ok "repository files and lockfile present"

expect "node" "$(node -v)" "v22.14.0"
expect "npm" "$(npm -v)" "10.9.7"

next_ver="$(node -p "require('next/package.json').version")"
react_ver="$(node -p "require('react/package.json').version")"
react_dom_ver="$(node -p "require('react-dom/package.json').version")"
lucide_ver="$(node -p "require('lucide-react/package.json').version")"
types_node_ver="$(node -p "require('@types/node/package.json').version")"
eslint_pkg_ver="$(node -p "require('eslint/package.json').version")"
playwright_pkg_ver="$(node -p "require('playwright/package.json').version")"
express_ver="$(node -p "require('express/package.json').version")"
cors_ver="$(node -p "require('cors/package.json').version")"
tsx_ver="$(node -p "require('tsx/package.json').version")"
ts_ver="$(node -p "require('typescript/package.json').version")"
ts6_ver="$(node -p "require('@typescript/typescript6/package.json').version")"

expect "next" "$next_ver" "16.3.2"
expect "react" "$react_ver" "19.2.8"
expect "react-dom" "$react_dom_ver" "19.2.8"
expect "lucide-react" "$lucide_ver" "1.34.0"
expect "@types/node" "$types_node_ver" "22.20.1"
expect "eslint" "$eslint_pkg_ver" "10.9.0"
expect "playwright" "$playwright_pkg_ver" "1.62.1"
expect "express" "$express_ver" "5.2.1"
expect "cors" "$cors_ver" "2.8.6"
expect "tsx" "$tsx_ver" "4.23.12"
expect "typescript" "$ts_ver" "7.0.2"
expect "@typescript/typescript6" "$ts6_ver" "6.0.2"

tsc_out="$(node ./node_modules/typescript/lib/tsc.js --version)"
[[ "$tsc_out" == *"7.0.2"* ]] || fail "tsc version is ${tsc_out}, expected 7.0.2"
ok "tsc ${tsc_out}"

command -v folio-mcp >/dev/null || fail "folio-mcp is not on PATH (npm i -g folio-mcp@0.4.1)"
ok "folio-mcp $(command -v folio-mcp)"

command -v wrangler >/dev/null || fail "wrangler is not on PATH (npm i -g wrangler@4)"
wrangler_ver="$(wrangler --version 2>/dev/null | head -n 1)"
[[ "$wrangler_ver" == 4.* || "$wrangler_ver" == *"4."* ]] || fail "wrangler version is ${wrangler_ver}, expected 4.x"
ok "wrangler ${wrangler_ver} (dry-run only; no deploy)"

chromium_dir="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
if compgen -G "${chromium_dir}/chromium-*" >/dev/null; then
  ok "Playwright Chromium present under ${chromium_dir}"
else
  fail "Playwright Chromium missing; run npx playwright install chromium"
fi

required_names=( )
optional_names=(
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  DATABASE_URI
  FIRECRAWL_API_KEY
  CONTEXT7_API_KEY
  OPENLAWS_API_KEY
  WESTLAW_USERNAME
  WESTLAW_PASSWORD
  LEXISNEXIS_API_KEY
  CJIS_ORI
  CJIS_AGENCY_ID
  NCIC_ORI
  NCIC_MNEMONIC
  FBI_UCR_AGENCY_ID
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

node ./node_modules/typescript/lib/tsc.js --noEmit
ok "typescript --noEmit"

bash scripts/eslint.sh src server --max-warnings=0
ok "eslint"

python3 - <<'PY'
import json
from pathlib import Path
cfg = json.loads(Path(".cursor/mcp.json").read_text())
servers = cfg["mcpServers"]
required = {
    "amplitude", "aws-cloudwatch", "figma", "linear", "stripe",
    "cloudflare", "cloudflare-code-mode", "playwright", "firecrawl", "postgres-mcp-pro",
    "sentry", "kubernetes", "slack", "context7", "folio",
}
missing = sorted(required - set(servers))
assert not missing, missing
banned = [k for k in servers if "github" in k.lower()]
assert not banned, banned
print("VERIFY OK: mcp.json servers", len(servers), "including", ", ".join(sorted(required)))
PY

bash scripts/check-env-placeholders.sh
ok "env placeholders empty in git and wired"

python3 - <<'PY'
from pathlib import Path
skills = list(Path(".cursor/skills").glob("*/skill.yaml"))
agents = list(Path(".cursor/agents").glob("*.md"))
pipelines = list(Path("scripts/pipelines").glob("*.sh"))
assert len(skills) == 16, len(skills)
assert len(agents) == 10, len(agents)
assert len(pipelines) >= 8, len(pipelines)
assert Path("workers/ci-gate.js").is_file()
assert Path("data/legal/glossary.json").is_file()
assert Path("data/p1/inventory-manifest.json").is_file()
assert Path("data/p1/one-shot-manifest.json").is_file()
assert Path("scripts/install-one-shot.sh").is_file()
assert Path(".cursor/permissions.json").is_file()
assert Path(".cursor/marketplace.json").is_file()
print("VERIFY OK: P1 roster", len(skills), "skills", len(agents), "agents", len(pipelines), "pipelines")
PY

python3 - <<'PY'
from pathlib import Path
recs = (Path(".vscode/extensions.json").read_text())
for ext in ("saoudrizwan.claude-dev", "RooVeterinaryInc.roo-cline", "Continue.continue"):
    assert ext in recs, ext
print("VERIFY OK: editor extension recommendations in .vscode/extensions.json")
PY

base="${VERIFY_BASE_URL:-http://127.0.0.1:43127}"
if curl -fsS -o /dev/null --max-time 3 "${base}/"; then
  payload='{"input":"write a launch email for our headphones","mode":"basic","requestType":"auto","platform":"chatgpt"}'
  body="$(curl -fsS --max-time 10 -H "Content-Type: application/json" -d "${payload}" "${base}/api/optimize")"
  echo "${body}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('status')=='complete' and d.get('optimizedPrompt'); assert d.get('ghostHand',{}).get('active') is False; print('VERIFY OK: optimize API', d['status'], len(d['optimizedPrompt']), 'chars')"
  detail='{"input":"write a launch email for our headphones. Make it good.","mode":"detail","skipQuestions":true,"requestType":"auto","platform":"chatgpt"}'
  dbody="$(curl -fsS --max-time 10 -H "Content-Type: application/json" -d "${detail}" "${base}/api/optimize")"
  echo "${dbody}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('status')=='complete'; gh=d.get('ghostHand',{}); assert gh.get('active') is True; assert gh.get('protocol')=='GHOST-HAND'; assert gh.get('engine')=='lyra-2'; assert gh.get('hyperDimensional') is True; assert gh.get('lattice',{}).get('axisCount',0)>=13; assert 'GHOST-HAND / Anchors' in d.get('optimizedPrompt',''); assert 'Lyra-2 / Dimensional lattice' in d.get('optimizedPrompt',''); assert 'AIP-Σ0' in d.get('optimizedPrompt',''); assert d.get('aipSigma0',{}).get('simulated') is False; assert d['aipSigma0']['promptScan']['verdict'] in ('pass','review'); print('VERIFY OK: GHOST-HAND Lyra-2', gh['engine'], gh['lattice']['axisCount'], 'axes', len(d['optimizedPrompt']), 'chars')"
  dip="$(curl -fsS --max-time 15 "${base}/api/aip/dive")"
  echo "${dip}" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('ok') is True and d.get('simulated') is False; assert d.get('fixturesOk') is True; print('VERIFY OK: AIP-Σ0 deep dive', d['proofHash'][:12], d['elapsedMs'], 'ms')"
else
  echo "VERIFY WARN: ${base} is not up; skipped live API check"
fi

local_api="${VERIFY_LOCAL_API:-http://127.0.0.1:4040}"
if curl -fsS -o /dev/null --max-time 3 "${local_api}/v1/models"; then
  python3 - "${local_api}" <<'PY'
import json, sys, urllib.request
base = sys.argv[1]
models = json.load(urllib.request.urlopen(base + "/v1/models", timeout=8))
ids = {m["id"] for m in models["data"]}
assert {"local-v1", "local-v1-concise"} <= ids, ids
p1 = json.load(urllib.request.urlopen(base + "/v1/p1?limit=1", timeout=8))
assert p1["totalSlots"] >= 11000, p1["totalSlots"]
mode = json.load(urllib.request.urlopen(base + "/v1/mode", timeout=8))
assert mode["engine"] == "lyra-2" and mode["hyperDimensional"] is True, mode
assert mode["lattice"]["axisCount"] >= 13, mode["lattice"]
inv = json.load(urllib.request.urlopen(base + "/v1/inventory", timeout=8))
assert inv["additionalSlots"] == 10000, inv["additionalSlots"]
assert len(inv["assets"]) >= 20, len(inv["assets"])
assert inv["cuckooLiveSandbox"] is False
shot = json.load(urllib.request.urlopen(base + "/v1/install", timeout=8))
assert shot["stepCount"] >= 20, shot["stepCount"]
assert shot["cuckooLiveSandbox"] is False
aip = json.load(urllib.request.urlopen(base + "/v1/aip", timeout=8))
assert aip["deployed"] is True and aip["simulated"] is False and aip["spectrum"] == "full", aip
assert aip["cloudflareLiveDeploy"] is False
scan_req = urllib.request.Request(
    base + "/v1/aip/scan",
    data=json.dumps({
        "text": "Miranda v. Arizona held that 87% of suspects confess, see 384 U.S. 436.",
        "anchors": [],
    }).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
scan = json.load(urllib.request.urlopen(scan_req, timeout=8))
assert scan["simulated"] is False
assert scan["verdict"] == "review", scan
kinds = {f["kind"] for f in scan["flags"]}
assert {"invented_citation", "unsourced_statistic", "unsourced_case_name"} <= kinds, kinds
assert scan["highCount"] >= 3, scan
grounded_req = urllib.request.Request(
    base + "/v1/aip/scan",
    data=json.dumps({
        "text": "Miranda v. Arizona held that 87% of suspects confess, see 384 U.S. 436.",
        "anchors": ["Miranda v. Arizona", "87%", "384 U.S. 436"],
    }).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
grounded = json.load(urllib.request.urlopen(grounded_req, timeout=8))
assert grounded["highCount"] == 0, grounded
assert grounded["verdict"] == "pass", grounded
dive = json.load(urllib.request.urlopen(base + "/v1/aip/dive", timeout=20))
assert dive["simulated"] is False and dive["ok"] is True, dive
assert dive["fixturesOk"] is True, dive
assert all(row["ok"] for row in dive["fixtureResults"]), dive["fixtureResults"]
assert dive["optimizer"]["briefScan"]["verdict"] == "review"
assert dive["optimizer"]["promptScan"]["verdict"] == "pass"
print("VERIFY OK: AIP-Σ0 scan review/pass", scan["highCount"], "ungrounded high; dive", dive["proofHash"][:12])
req = urllib.request.Request(
    base + "/v1/chat/completions",
    data=json.dumps({
        "model": "local-v1-concise",
        "messages": [{"role": "user", "content": "Summarize why qualified immunity has two prongs."}],
    }).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer ignored"},
    method="POST",
)
chat = json.load(urllib.request.urlopen(req, timeout=20))
assert chat["choices"][0]["message"]["content"], chat
assert "AIP-Σ0" in chat["choices"][0]["message"]["content"]
env = json.load(urllib.request.urlopen(base + "/v1/env", timeout=8))
names = {row["name"] for row in env["variables"]}
needed = {
    "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "DATABASE_URI",
    "FIRECRAWL_API_KEY", "CONTEXT7_API_KEY", "OPENLAWS_API_KEY",
    "WESTLAW_USERNAME", "WESTLAW_PASSWORD", "LEXISNEXIS_API_KEY",
}
assert needed <= names, needed - names
assert env["secretsInGit"] is False
print("VERIFY OK: local API models/p1/chat/env", p1["totalSlots"], "p1 slots")
PY
else
  echo "VERIFY WARN: ${local_api} is not up; skipped local API check"
fi

ok "build verify finished"
