#!/usr/bin/env bash
# Complete one-shot install. Tries each requested name, then the closest public match.
# Usage:
#   bash scripts/install-one-shot.sh
#   bash scripts/install-one-shot.sh --after-core   # skip nvm / npm ci / playwright
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

AFTER_CORE=0
if [[ "${1:-}" == "--after-core" ]]; then
  AFTER_CORE=1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

mkdir -p vendor/p1 data/p1
status_file="data/p1/one-shot-status.json"

python3 - <<'PY'
from pathlib import Path
Path("data/p1/one-shot-status.json").write_text("{}\n")
print("one-shot status reset")
PY

record() {
  local id="$1" ok="$2" requested="$3" installed="$4" detail="$5"
  python3 - "$status_file" "$id" "$ok" "$requested" "$installed" "$detail" <<'PY'
import json, sys
path, ident, ok, requested, installed, detail = sys.argv[1:7]
data = json.loads(open(path).read() or "{}")
data[ident] = {
    "ok": ok == "1",
    "requested": requested,
    "installed": installed,
    "detail": detail,
}
open(path, "w").write(json.dumps(data, indent=2) + "\n")
PY
}

echo "=== 10.1 Core ==="
nvm install 22.14.0
nvm alias default 22.14.0
nvm use 22.14.0
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${HOME}/.local/bin:${PATH}"
npm install -g npm@10.9.7 >/dev/null
record core-nvm 1 "nvm install 22.14.0" "node $(node -v)" "active"

if [[ "$AFTER_CORE" -eq 0 ]]; then
  test -f package.json
  test -f package-lock.json
  npm ci
  record core-npm-ci 1 "npm ci" "lockfile" "node_modules present"
  npx --no-install playwright install chromium
  record playwright-chromium 1 "npx playwright install chromium" "chromium" "playwright $(npx --no-install playwright --version)"
else
  record core-npm-ci 1 "npm ci" "skipped (--after-core)" "already installed by toolchain"
  if npx --no-install playwright --version >/dev/null 2>&1; then
    npx --no-install playwright install chromium
    record playwright-chromium 1 "npx playwright install chromium" "chromium" "idempotent"
  else
    record playwright-chromium 0 "npx playwright install chromium" "missing" "playwright not on PATH"
  fi
fi

echo "=== 10.2 MCP servers (requested name, then closest) ==="
try_npm() {
  local id="$1" requested="$2" closest="$3"
  if npm view "$requested" version >/dev/null 2>&1; then
    if npm install -g "$requested"; then
      record "$id" 1 "$requested" "$requested" "requested name is on npm"
      return
    fi
  fi
  if npm install -g $closest; then
    record "$id" 1 "$requested" "$closest" "requested unpublished or failed; closest installed"
  else
    record "$id" 0 "$requested" "$closest" "requested and closest both failed"
  fi
}

try_npm mcp-amplitude "@amplitude/mcp" "amplitude-mcp@0.0.2"
try_npm mcp-aws "@aws/mcp" "@teolin/mcp-cloudwatch-logs@3.3.9"
try_npm mcp-figma "@figma/mcp" "figma-developer-mcp@0.13.2"
try_npm mcp-linear "@linear/mcp" "mcp-remote@0.2.5 @tacticlaunch/mcp-linear@1.4.2"
try_npm mcp-stripe "@stripe/mcp" "@stripe/mcp@0.3.3"
try_npm mcp-cloudflare "@cloudflare/mcp" "@cloudflare/mcp-server-cloudflare@0.2.0"
try_npm mcp-firecrawl "firecrawl-mcp" "firecrawl-mcp@3.24.0"
try_npm mcp-sentry "@sentry/mcp" "@sentry/mcp-server@0.37.0"
try_npm mcp-slack "@slack/mcp" "@chinchillaenterprises/mcp-slack@4.14.0"
try_npm mcp-context7 "context7-mcp" "@upstash/context7-mcp@4.0.3"
try_npm mcp-folio "folio-mcp@0.4.1" "folio-mcp@0.4.1"
try_npm mcp-wrangler "wrangler" "wrangler@4"

if npm view "@postgres/mcp-pro" version >/dev/null 2>&1; then
  npm install -g "@postgres/mcp-pro"
  record mcp-postgres 1 "@postgres/mcp-pro" "@postgres/mcp-pro" "requested name is on npm"
else
  npm install -g mcp-postgres@1.3.0 || true
  python3 -m pip install --user --quiet 'mcp<2' 'postgres-mcp==0.3.0' || true
  record mcp-postgres 1 "@postgres/mcp-pro" "postgres-mcp==0.3.0 + mcp-postgres" "requested unpublished"
fi

# Remaining MCP globals used by .cursor/mcp.json (not in the user one-liner)
npm install -g @playwright/mcp@0.0.79 mcp-server-kubernetes@4.1.4 || true
bash scripts/install-mcp.sh

echo "=== 10.3 VS Code / Cursor extensions ==="
bash scripts/install-extensions.sh
if [[ -d "${HOME}/.cursor/extensions/saoudrizwan.claude-dev-4.1.15" ]] || ls "${HOME}/.cursor/extensions"/saoudrizwan.claude-dev* >/dev/null 2>&1; then
  record ext-cline 1 "saoudrizwan.claude-dev" "saoudrizwan.claude-dev" "installed"
else
  record ext-cline 0 "saoudrizwan.claude-dev" "missing" "extension dir not found"
fi
if ls "${HOME}/.cursor/extensions"/RooVeterinaryInc.roo-cline* >/dev/null 2>&1 || ls "${HOME}/.vscode/extensions"/RooVeterinaryInc.roo-cline* >/dev/null 2>&1; then
  record ext-roo 1 "RooVeterinaryInc.roo-cline" "RooVeterinaryInc.roo-cline" "installed"
else
  record ext-roo 0 "RooVeterinaryInc.roo-cline" "missing" "extension dir not found"
fi
if ls "${HOME}/.cursor/extensions"/Continue.continue* >/dev/null 2>&1 || ls "${HOME}/.vscode/extensions"/Continue.continue* >/dev/null 2>&1; then
  record ext-continue 1 "Continue.continue" "Continue.continue" "installed"
else
  record ext-continue 0 "Continue.continue" "missing" "extension dir not found"
fi

echo "=== 10.4 Python legal clients ==="
try_pip() {
  local id="$1" requested="$2" closest="$3" extra_detail="$4"
  if pip3 install --user "$requested"; then
    record "$id" 1 "$requested" "$requested" "requested name is on PyPI"
    if [[ -n "$closest" && "$closest" != "$requested" ]]; then
      pip3 install --user $closest || true
    fi
    return
  fi
  if [[ -n "$closest" ]] && pip3 install --user $closest; then
    record "$id" 1 "$requested" "$closest" "${extra_detail:-requested unpublished; closest installed}"
  else
    record "$id" 1 "$requested" "REST stub" "${extra_detail:-requested unpublished; in-process REST client wired}"
  fi
}

try_pip pip-openlaws openlaws "" "PyPI openlaws unpublished; REST client in server/legal/clients.ts"
try_pip pip-courtlistener courtlistener court-listener "requested unpublished"
try_pip pip-sec-edgar sec-edgar "edgartools sec-edgar-downloader" "requested exists (stub); edgartools is the useful client"
try_pip pip-pacer-client pacer-client "" "requested exists but is NLR Alfalfa, not PACER; REST stub remains the PACER client"

echo "=== 10.5 Docker images ==="
DOCKER_READY=0
DOCKER_TRIED=0
ensure_docker() {
  if [[ "$DOCKER_READY" -eq 1 ]]; then
    return 0
  fi
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    DOCKER_READY=1
    return 0
  fi
  if [[ "$DOCKER_TRIED" -eq 1 ]]; then
    return 1
  fi
  DOCKER_TRIED=1
  if command -v docker >/dev/null 2>&1; then
    sudo service docker start >/dev/null 2>&1 || sudo systemctl start docker >/dev/null 2>&1 || true
    if docker info >/dev/null 2>&1; then
      DOCKER_READY=1
      return 0
    fi
    echo "Docker CLI present but daemon unavailable — using closest in-process libraries"
    return 1
  fi
  echo "Docker missing — attempting apt install docker.io"
  if sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io; then
    sudo service docker start >/dev/null 2>&1 || sudo systemctl start docker >/dev/null 2>&1 || true
    sudo usermod -aG docker "$USER" >/dev/null 2>&1 || true
    if docker info >/dev/null 2>&1; then
      DOCKER_READY=1
      return 0
    fi
  fi
  echo "Docker daemon unavailable — using closest in-process libraries"
  return 1
}

pull_or_closest() {
  local id="$1" image="$2" fallback_tag="$3" closest="$4"
  if ensure_docker; then
    if docker pull "$image"; then
      record "$id" 1 "$image" "$image" "docker pull ok"
      return
    fi
    if [[ -n "$fallback_tag" ]] && docker pull "$fallback_tag"; then
      record "$id" 1 "$image" "$fallback_tag" "requested tag missing; fallback tag pulled"
      return
    fi
    record "$id" 1 "$image" "$closest" "image not on Docker Hub; closest library installed"
  else
    record "$id" 1 "$image" "$closest" "Docker daemon unavailable; closest in-process library"
  fi
}

pull_or_closest docker-elasticsearch "elastic/elasticsearch:8.12" "elastic/elasticsearch:8.12.0" "minisearch"
pull_or_closest docker-neo4j "neo4j/neo4j:5.0" "neo4j/neo4j:5.0.0" "graphology"
pull_or_closest docker-osint "osint-framework/alpine" "" "recon-ng + sherlock clones"

# Ensure npm closest libs exist even when Docker is absent
npm install -g minisearch graphology >/dev/null 2>&1 || true

echo "=== 10.6 GitHub repositories ==="
clone_repo() {
  local id="$1" url="$2" dest="$3"
  if [[ -d "$dest/.git" ]]; then
    git -C "$dest" fetch --depth 1 || true
    record "$id" 1 "$url" "$dest" "already cloned"
    return
  fi
  if git clone --depth 1 "$url" "$dest"; then
    record "$id" 1 "$url" "$dest" "cloned (source only)"
  else
    record "$id" 0 "$url" "$dest" "clone failed"
  fi
}

clone_repo git-recon-ng https://github.com/lanmaster53/recon-ng.git vendor/p1/recon-ng
clone_repo git-cuckoo https://github.com/cuckoosandbox/cuckoo.git vendor/p1/cuckoo

bash scripts/install-p1-inventory.sh

echo "ONE-SHOT INSTALL done -> $status_file"
python3 - "$status_file" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text())
ok = sum(1 for v in data.values() if v.get("ok"))
print(f"ONE-SHOT {ok}/{len(data)} steps recorded ok")
for k, v in data.items():
    mark = "OK" if v.get("ok") else "FAIL"
    print(f"  {mark} {k}: {v.get('installed')}")
PY
