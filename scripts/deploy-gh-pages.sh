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

echo "==> static export build (API routes parked)"
api_backup=""
if [[ -d src/app/api ]]; then
  api_backup="src/app/_api_parked_for_static_export"
  rm -rf "$api_backup"
  mv src/app/api "$api_backup"
fi
cleanup() {
  if [[ -n "$api_backup" && -d "$api_backup" ]]; then
    rm -rf src/app/api
    mv "$api_backup" src/app/api
  fi
}
trap cleanup EXIT

rm -rf out
rm -rf .next || true
# If a prior crash left a sticky turbopack dir, force it once more.
if [[ -d .next ]]; then
  chmod -R u+w .next 2>/dev/null || true
  rm -rf .next || true
fi
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/anomaly-tracker npm run build
test -d out
# GitHub Pages Jekyll must not process the export (keeps _next/).
touch out/.nojekyll
test -f out/tracker/index.html -o -f out/tracker.html -o -d out/tracker

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

echo "==> publish ./out to gh-pages"
npx --yes gh-pages@6.2.0 -d out -b gh-pages \
  -r "$remote_url" \
  -m "deploy: static anomaly-tracker $(date -u +%Y-%m-%dT%H:%MZ)"

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
for i in $(seq 1 36); do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$URL" || true)
  TRACK=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "${URL}tracker/" || true)
  if [[ "$CODE" == "200" || "$TRACK" == "200" ]]; then
    CODE="$TRACK"
    [[ "$TRACK" == "200" ]] || CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 20 "$URL" || true)
    break
  fi
  echo "waiting… ($i/36, root=$CODE tracker=$TRACK)"
  sleep 10
done

git remote set-url anomaly-tracker "https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

echo "═══════════════════════════════════════"
echo "LIVE: ${URL}"
echo "TRACKER: ${URL}tracker/"
echo "HTTP STATUS: $CODE"
echo "═══════════════════════════════════════"
