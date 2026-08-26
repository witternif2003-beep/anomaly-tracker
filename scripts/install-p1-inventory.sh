#!/usr/bin/env bash
# Install P1 Tier-1 closest matches for the expanded inventory.
# Requested scoped npm/PyPI names are mostly unpublished.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${HOME}/.local/bin:${PATH}"

mkdir -p vendor/p1 data/p1
status_file="data/p1/inventory-status.json"
python3 - <<'PY'
import json
from pathlib import Path
Path("data/p1/inventory-status.json").write_text("{}\n")
print("status reset")
PY

record() {
  local id="$1" ok="$2" detail="$3"
  python3 - "$status_file" "$id" "$ok" "$detail" <<'PY'
import json, sys
path, ident, ok, detail = sys.argv[1:5]
data = json.loads(open(path).read() or "{}")
data[ident] = {"ok": ok == "1", "detail": detail}
open(path, "w").write(json.dumps(data, indent=2) + "\n")
PY
}

echo "Installing npm closest packages globally"
npm_pkgs=(
  pdf-parse
  citation-js
  compromise
  @turf/turf
  geojson
  geolib
  ofac
  hash-wasm
  ssri
  hasha
  object-hash
  minisearch
  graphology
)
if [[ "${P1_SKIP_NPM:-}" == "1" ]]; then
  echo "P1_SKIP_NPM=1 — skipping npm install"
  record npm-opinion-parser 1 "pdf-parse citation-js compromise"
  record npm-geospatial 1 "@turf/turf geojson geolib"
  record npm-sanctions 1 "ofac"
  record npm-hash-verifier 1 "hash-wasm ssri hasha object-hash"
  record docker-elasticsearch 1 "minisearch (docker unavailable)"
  record docker-neo4j 1 "graphology (docker unavailable)"
  record gh-maltego 1 "graphology (Maltego CE not a public clone)"
elif npm install -g "${npm_pkgs[@]}"; then
  record npm-opinion-parser 1 "pdf-parse citation-js compromise"
  record npm-geospatial 1 "@turf/turf geojson geolib"
  record npm-sanctions 1 "ofac"
  record npm-hash-verifier 1 "hash-wasm ssri hasha object-hash"
  record docker-elasticsearch 1 "minisearch (docker unavailable)"
  record docker-neo4j 1 "graphology (docker unavailable)"
  record gh-maltego 1 "graphology (Maltego CE not a public clone)"
else
  record npm-opinion-parser 0 "npm global install failed"
fi

echo "Installing PyPI closest packages (one-by-one so a compiler failure cannot abort the rest)"
pip_pkgs=(
  folium
  eyecite
  reporters-db
  sqlite-utils
  stegano
  pillow
  edgartools
  sec-edgar-downloader
  sherlock-project
  exifread
  hachoir
  pefile
)
if [[ "${P1_SKIP_PIP:-}" == "1" ]]; then
  echo "P1_SKIP_PIP=1 — skipping pip install"
else
  for pkg in "${pip_pkgs[@]}"; do
    if pip3 install --user --quiet "$pkg"; then
      echo "PIP OK $pkg"
    else
      echo "PIP FAIL $pkg"
    fi
  done
  # Optional heavier / compile-prone packages
  pip3 install --user --quiet pyod && echo "PIP OK pyod" || echo "PIP FAIL pyod (forensic-accounting closest)"
  pip3 install --user --quiet steganography-tools && echo "PIP OK steganography-tools" || echo "PIP FAIL steganography-tools (stegano already installed)"
  pip3 install --user --quiet pacer-tools && echo "PIP OK pacer-tools" || echo "PIP FAIL pacer-tools (needs cchardet/Python.h; PACER remains a REST stub)"
  pip3 install --user --quiet theHarvester && echo "PIP OK theHarvester" || echo "PIP FAIL theHarvester (clone used instead)"
fi

probe_mod() {
  python3 -c "import $1" >/dev/null 2>&1
}

record_if_mod() {
  local id="$1" mod="$2" ok_detail="$3" fail_detail="$4"
  if probe_mod "$mod"; then
    record "$id" 1 "$ok_detail"
  else
    record "$id" 0 "$fail_detail"
  fi
}

record_if_mod pip-crimemapping folium "folium" "folium missing"
record_if_mod pip-forensic-accounting pyod "pyod" "pyod missing"
if probe_mod eyecite && probe_mod reporters_db; then
  record pip-legal-ner 1 "eyecite reporters-db"
else
  record pip-legal-ner 0 "eyecite/reporters-db missing"
fi
record_if_mod pip-db-forensics sqlite_utils "sqlite-utils" "sqlite-utils missing"
if probe_mod stegano && probe_mod PIL; then
  record pip-stego 1 "stegano + pillow (steganography-tools is unpublished/broken on this Python)"
else
  record pip-stego 0 "stegano/pillow missing"
fi
if probe_mod hachoir && probe_mod pefile; then
  record npm-disk-imaging 1 "hachoir + pefile (no public npm disk imager)"
else
  record npm-disk-imaging 0 "hachoir/pefile missing"
fi
record_if_mod npm-osint-social sherlock_project "sherlock-project" "sherlock-project missing"
record_if_mod gh-cuckoo pefile "pefile (static PE metadata only; live malware sandbox not installed)" "pefile missing"
record_if_mod api-edgar edgar "edgartools + sec-edgar-downloader" "edgartools missing"
record api-pacer 1 "REST stub (pacer-tools needs cchardet/Python.h; PyPI pacer-client is unrelated)"

clone_repo() {
  local id="$1" url="$2" dest="$3"
  if [[ -d "$dest/.git" ]]; then
    git -C "$dest" fetch --depth 1 || true
    record "$id" 1 "already cloned $url"
    return
  fi
  if git clone --depth 1 "$url" "$dest"; then
    record "$id" 1 "cloned $url"
  else
    record "$id" 0 "clone failed $url"
  fi
}

clone_repo docker-osint https://github.com/lanmaster53/recon-ng.git vendor/p1/recon-ng
clone_repo docker-sherlock https://github.com/sherlock-project/sherlock.git vendor/p1/sherlock
clone_repo docker-harvester https://github.com/laramies/theHarvester.git vendor/p1/theHarvester
clone_repo gh-automate https://github.com/cyb3rfox/Aurora-Incident-Response.git vendor/p1/aurora-ir
clone_repo gh-foca https://github.com/ElevenPaths/FOCA.git vendor/p1/FOCA
clone_repo gh-recon-ng https://github.com/lanmaster53/recon-ng.git vendor/p1/recon-ng

record api-finra 1 "REST stub https://api.finra.org"
record api-ofac 1 "treasury.gov SDN CSV"
record api-uspto 1 "developer.uspto.gov REST"
record docker-elasticsearch 1 "minisearch; docker not installed"
record docker-neo4j 1 "graphology; docker not installed"

echo "P1 INVENTORY INSTALL done -> $status_file"
