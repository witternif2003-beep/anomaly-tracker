#!/usr/bin/env bash
# Guard: tracker HTML must stay small enough for mobile browsers.
# Embedding multi-MB anomaly.json into index.html causes "This page couldn't load".
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

html="${TRACKER_HTML:-$root/out/tracker/index.html}"
if [[ ! -f "$html" ]]; then
  echo "PIPELINE SKIP tracker-html-budget (no out/tracker/index.html yet)"
  exit 0
fi

python3 - "$html" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
size = path.stat().st_size
limit = 900_000  # ~0.9MB hard ceiling for mobile HTML
text = path.read_text(encoding="utf-8", errors="ignore")
errors = []
if size > limit:
    errors.append(f"tracker HTML too large: {size} bytes (limit {limit}) — do not SSR-inline anomaly.json")
if "lyra.anomaly-tracker" in text and size > 400_000:
    errors.append("tracker HTML appears to embed lyra.anomaly-tracker payload")
if "lyra.black-owned-scan-bot" in text and text.count("bo-crime-") > 50:
    errors.append("tracker HTML embeds black-owned crime stream")
if errors:
    print("PIPELINE FAIL tracker-html-budget")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print(f"PIPELINE OK tracker-html-budget size={size}")
PY
