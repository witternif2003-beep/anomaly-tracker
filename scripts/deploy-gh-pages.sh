#!/usr/bin/env bash
# Static GitHub Pages deploy for anomaly-tracker (./out → gh-pages).
# Does not re-init git or rewrite history. Requires GITHUB_TOKEN.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${PATH}"

GITHUB_USERNAME="${GITHUB_USERNAME:-witternif2003-beep}"
GITHUB_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
REPO_NAME="${REPO_NAME:-anomaly-tracker}"
[[ -n "$GITHUB_TOKEN" ]] || { echo "Set GITHUB_TOKEN" >&2; exit 1; }
export GITHUB_TOKEN GH_TOKEN="$GITHUB_TOKEN"

echo "==> generate static JSON"
npx --no-install tsx scripts/generate-static-site-data.ts

echo "==> static export build"
if [[ -d src/app/api ]]; then
  echo "Moving leftover src/app/api -> server/next-api-routes"
  rm -rf server/next-api-routes
  mv src/app/api server/next-api-routes
fi

rm -rf out
rm -rf .next || true
if [[ -d .next ]]; then
  chmod -R u+w .next 2>/dev/null || true
  rm -rf .next || true
fi
npm run build
test -d out
# GitHub Pages Jekyll must not process the export (keeps _next/).
touch out/.nojekyll
test -f out/tracker/index.html -o -f out/tracker.html -o -d out/tracker
test -f out/corporate/index.html -o -d out/corporate
# Asset prefix sanity on corporate page
grep -q '/anomaly-tracker/_next' out/corporate/index.html

echo "==> tracker HTML budget (mobile load guard)"
bash scripts/pipelines/tracker-html-budget.sh

echo "==> ensure GitHub repo exists"
if ! gh repo view "${GITHUB_USERNAME}/${REPO_NAME}" >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --public --description "Lyra anomaly tracker (static GitHub Pages)"
fi

remote_url="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
if git remote get-url anomaly-tracker >/dev/null 2>&1; then
  git remote set-url anomaly-tracker "$remote_url"
else
  git remote add anomaly-tracker "$remote_url"
fi

echo "==> push source main"
git push -u anomaly-tracker HEAD:main

echo "==> publish ./out to gh-pages as a CLEAN orphan tree (no leftover .cursor / source pollution)"
touch out/.nojekyll
# Strip Next.js RSC debug text dumps that can confuse Pages builders.
find out -maxdepth 1 -type f -name '__next.*.txt' -delete || true
EXPECTED_POSTDOC=$(python3 - <<'PY'
import json
print(json.load(open("public/static/anomaly.json"))["postdocCatalog"]["total"])
PY
)
publish_dir="$(mktemp -d /tmp/lyra-gh-pages-XXXXXX)"
# Copy export only (no repo dotfiles leaking in).
cp -a out/. "$publish_dir/"
touch "$publish_dir/.nojekyll"
# Guard: polluted publish must never ship agent config.
if [[ -e "$publish_dir/.cursor" || -e "$publish_dir/package.json" || -e "$publish_dir/src" ]]; then
  echo "Refusing polluted Pages publish tree" >&2
  exit 1
fi
(
  cd "$publish_dir"
  git init -q
  git checkout -q -b gh-pages
  git add -A
  git -c user.name="lyra-pages" -c user.email="lyra-pages@local" commit -qm \
    "deploy: static anomaly-tracker $(date -u +%Y-%m-%dT%H:%MZ) postdoc=${EXPECTED_POSTDOC}"
  git push -qf "$remote_url" gh-pages:gh-pages
)
rm -rf "$publish_dir"

echo "==> point Pages at gh-pages /"
curl -sS -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/pages" \
  -d '{"build_type":"legacy","source":{"branch":"gh-pages","path":"/"}}' >/tmp/pages-post.json || true
curl -sS -X PUT \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/pages" \
  -d '{"build_type":"legacy","source":{"branch":"gh-pages","path":"/"}}' >/tmp/pages-put.json || true

URL="https://${GITHUB_USERNAME}.github.io/${REPO_NAME}/"
CODE=000
CHUNK_CODE=000
LIVE_POSTDOC=0
PAGES_STATUS="unknown"
for i in $(seq 1 45); do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "${URL}tracker/" || true)
  html=$(curl -fsS --max-time 20 "${URL}tracker/" || true)
  chunk=$(printf '%s' "$html" | python3 -c "import re,sys; m=re.findall(r'/anomaly-tracker(/_next/static/chunks/[^\" ]+\.js)', sys.stdin.read()); print(m[0] if m else '')")
  if [[ -n "$chunk" ]]; then
    CHUNK_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "https://${GITHUB_USERNAME}.github.io/${REPO_NAME}${chunk}" || true)
  fi
  nojekyll=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "${URL}.nojekyll" || true)
  LIVE_POSTDOC=$(curl -fsS --max-time 60 -H 'Cache-Control: no-cache' "${URL}static/anomaly.json" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('postdocCatalog',{}).get('total',0))" 2>/dev/null || echo 0)
  PAGES_STATUS=$(curl -fsS -H "Authorization: Bearer ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/pages" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo unknown)
  echo "waiting… ($i/45, tracker=$CODE chunk=$CHUNK_CODE nojekyll=$nojekyll pages=$PAGES_STATUS postdoc=$LIVE_POSTDOC want=$EXPECTED_POSTDOC)"
  if [[ "$CODE" == "200" && "$CHUNK_CODE" == "200" && "$LIVE_POSTDOC" == "$EXPECTED_POSTDOC" && "$PAGES_STATUS" == "built" ]]; then
    break
  fi
  sleep 8
done

if [[ "$LIVE_POSTDOC" != "$EXPECTED_POSTDOC" || "$PAGES_STATUS" != "built" ]]; then
  echo "DEPLOY WARN: live postdoc=$LIVE_POSTDOC pages=$PAGES_STATUS (expected postdoc=$EXPECTED_POSTDOC pages=built)" >&2
fi

git remote set-url anomaly-tracker "https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo "═══════════════════════════════════════"
echo "LIVE: ${URL}"
echo "TRACKER: ${URL}tracker/"
echo "CORPORATE: ${URL}corporate/"
echo "HTTP tracker=$CODE chunk=$CHUNK_CODE pages=$PAGES_STATUS postdoc=$LIVE_POSTDOC"
echo "═══════════════════════════════════════"
