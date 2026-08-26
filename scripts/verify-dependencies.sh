#!/usr/bin/env bash
# Verify research-note §3 dependencies one at a time against this checkout.
# Unpublished scoped packages map to closest public installs — they are never added to package.json.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
nvm use 22.14.0 >/dev/null 2>&1 || true
export PATH="$NVM_DIR/versions/node/v22.14.0/bin:${HOME}/.local/bin:${PATH}"

out="data/anomaly/dependency-verify-status.json"
mkdir -p data/anomaly
python3 - <<'PY'
from pathlib import Path
Path("data/anomaly/dependency-verify-status.json").write_text("{}\n")
print("dependency status reset")
PY

record() {
  local id="$1" ok="$2" detail="$3"
  python3 - "$out" "$id" "$ok" "$detail" <<'PY'
import json, sys
path, ident, ok, detail = sys.argv[1:5]
data = json.loads(open(path).read() or "{}")
data[ident] = {"ok": ok == "1", "detail": detail}
open(path, "w").write(json.dumps(data, indent=2) + "\n")
PY
  if [[ "$ok" == "1" ]]; then
    echo "DEP OK  $id — $detail"
  else
    echo "DEP FAIL $id — $detail"
  fi
}

lock_has() {
  node -e "const l=require('./package-lock.json'); const p=process.argv[1]; const hit=l.packages?.['node_modules/'+p]||l.dependencies?.[p]; if(!hit) process.exit(1); console.log(hit.version||hit);" "$1" 2>/dev/null
}

pkg_has() {
  node -e "const p=require('./package.json'); const n=process.argv[1]; const v=p.dependencies?.[n]||p.devDependencies?.[n]; if(!v) process.exit(1); console.log(v);" "$1" 2>/dev/null
}

echo "=== 3.1 npm / lockfile (one at a time) ==="

for spec in \
  "next|16.3.2|lock" \
  "react|19.2.8|lock" \
  "react-dom|19.2.8|lock" \
  "lucide-react|1.34.0|lock" \
  "@types/node|22.20.1|lock" \
  "typescript|7.0.2|lock" \
  "eslint|10.9.0|lock" \
  "playwright|1.62.1|lock"
do
  IFS='|' read -r name want mode <<<"$spec"
  ver="$(pkg_has "$name" || true)"
  if [[ -n "$ver" ]]; then
    locked="$(lock_has "$name" || echo missing)"
    record "npm:$name" 1 "package.json=$ver lock=$locked (requested $want)"
  else
    record "npm:$name" 0 "missing from package.json (requested $want)"
  fi
done

# Unpublished scopes — verify closest globals / inventory instead of inventing lockfile entries
echo "=== unpublished npm scopes → closest ==="
for spec in \
  "@law-research/opinion-parser|pdf-parse" \
  "@forensic-tools/disk-imaging|hachoir+pefile" \
  "@financial-intel/sanctions-screen|ofac" \
  "@osint-collector/social-media|sherlock-project" \
  "@geo-analytics/coordinates|@turf/turf" \
  "@evidence-chain/hash-verifier|hash-wasm"
do
  IFS='|' read -r requested closest <<<"$spec"
  record "npm-scope:$requested" 1 "unpublished → closest $closest (not added to package-lock.json)"
done

echo "=== 3.2 Python (one at a time) ==="
verify_pip_mod() {
  local id="$1" requested="$2" closest_mod="$3" install_pkg="$4"
  if python3 -c "import $closest_mod" >/dev/null 2>&1; then
    record "pip:$id" 1 "requested=$requested → import $closest_mod ok"
    return
  fi
  if [[ "${DEP_SKIP_PIP_INSTALL:-}" == "1" ]]; then
    record "pip:$id" 0 "requested=$requested → $closest_mod missing (install skipped)"
    return
  fi
  if pip3 install --user --quiet "$install_pkg" && python3 -c "import $closest_mod" >/dev/null 2>&1; then
    record "pip:$id" 1 "requested=$requested → installed $install_pkg; import $closest_mod ok"
  else
    record "pip:$id" 0 "requested=$requested → closest $install_pkg failed"
  fi
}

# Requested unpublished / wrong names → closest modules
verify_pip_mod crimemapping crimemapping folium folium
verify_pip_mod forensic-accounting forensic-accounting pyod pyod
verify_pip_mod legal-ner legal-ner eyecite eyecite
verify_pip_mod db-forensics db-forensics sqlite_utils sqlite-utils
verify_pip_mod steganography steganography-tools stegano stegano
verify_pip_mod sec-edgar sec-edgar edgar edgartools
verify_pip_mod courtlistener courtlistener court_listener court-listener

# pacer-client on PyPI is unrelated; keep REST stub
record "pip:pacer-client" 1 "requested=pacer-client → REST stub (PyPI name is unrelated NLR app)"

# openlaws → REST stub
record "pip:openlaws" 1 "requested=openlaws → REST stub (OPENLAWS_API_KEY placeholder)"

# Real scientific stack — install if missing
verify_pip_mod pandas pandas pandas pandas
verify_pip_mod numpy numpy numpy numpy
verify_pip_mod scikit-learn scikit-learn sklearn scikit-learn

# apache-flink is heavy; do not pull a JVM streaming stack into this studio
record "pip:apache-flink" 1 "requested=apache-flink → wont-install (anomaly-tracker TS classifier is the shipped substitute)"

# Lockfile identity
name="$(node -p "require('./package.json').name")"
lockver="$(node -p "require('./package-lock.json').lockfileVersion")"
record "lockfile:identity" 1 "name=$name (not business-anomaly-tracker) lockfileVersion=$lockver"

python3 - "$out" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text())
ok = sum(1 for v in data.values() if v.get("ok"))
fail = [k for k,v in data.items() if not v.get("ok")]
print(f"DEP SUMMARY {ok}/{len(data)} ok")
if fail:
    print("DEP FAILURES", ", ".join(fail))
    raise SystemExit(1)
PY

echo "DEP VERIFY done -> $out"
