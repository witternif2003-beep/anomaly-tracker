#!/usr/bin/env bash
# Create (if needed) and push Lyra to GitHub. Requires GITHUB_TOKEN with repo scope.
# Does NOT add GitHub Actions workflows (project policy: Cloudflare CI only).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [[ -z "$token" ]]; then
  echo "REFUSED: set GITHUB_TOKEN (repo create + contents write)." >&2
  exit 1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${PATH}"
export GH_TOKEN="$token"
export GITHUB_TOKEN="$token"

owner="${GITHUB_OWNER:-}"
repo_name="${GITHUB_REPO:-lyra}"
visibility="${GITHUB_VISIBILITY:-public}"

if [[ -z "$owner" ]]; then
  owner="$(curl -fsS -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" \
    https://api.github.com/user | python3 -c "import json,sys; print(json.load(sys.stdin)['login'])")"
fi

api="https://api.github.com/repos/${owner}/${repo_name}"
code="$(curl -sS -o /tmp/gh-repo.json -w '%{http_code}' -H "Authorization: Bearer $token" \
  -H "Accept: application/vnd.github+json" "$api")"
if [[ "$code" == "404" ]]; then
  echo "Creating ${owner}/${repo_name} (${visibility})"
  curl -fsS -X POST -H "Authorization: Bearer $token" -H "Accept: application/vnd.github+json" \
    https://api.github.com/user/repos \
    -d "$(python3 - <<PY
import json
print(json.dumps({
  "name": "${repo_name}",
  "description": "Lyra — prompt-optimization studio + unclassified anomaly tracker",
  "private": "${visibility}" == "private",
  "auto_init": False,
  "has_issues": True,
  "has_projects": False,
  "has_wiki": False,
}))
PY
)" >/tmp/gh-create.json
elif [[ "$code" != "200" ]]; then
  echo "GitHub repo lookup failed HTTP ${code}" >&2
  cat /tmp/gh-repo.json >&2
  exit 1
fi

url="https://x-access-token:${token}@github.com/${owner}/${repo_name}.git"
if git remote get-url github >/dev/null 2>&1; then
  git remote set-url github "$url"
else
  git remote add github "$url"
fi

git push -u github HEAD:main
echo "GITHUB_OK https://github.com/${owner}/${repo_name}"
echo "Clone: git clone https://github.com/${owner}/${repo_name}.git"
