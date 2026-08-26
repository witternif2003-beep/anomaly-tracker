#!/usr/bin/env bash
# Research-note §6.2 scan pipeline — fixture rehearsal only.
# Does NOT scrape Secretary-of-State registries, run FBI matchers, or POST Slack webhooks.
# Polls the local anomaly tracker API against hard-coded fixtures.
set -euo pipefail

base="${LOCAL_API_URL:-http://127.0.0.1:4040}"
loops="${SCAN_LOOPS:-1}"
sleep_s="${SCAN_SLEEP_SECONDS:-0}"
out_dir="${SCAN_OUT_DIR:-/tmp/lyra-scan}"
mkdir -p "$out_dir"

if [[ "${loops}" -lt 1 ]]; then
  echo "SCAN FAIL: SCAN_LOOPS must be >= 1" >&2
  exit 1
fi

echo "=== Lyra scan-pipeline (fixture rehearsal) ==="
echo "base=${base} loops=${loops} (no live registry scrape, no Slack webhook)"

for ((i = 1; i <= loops; i++)); do
  echo "--- pass ${i}/${loops} ---"
  curl -fsS --max-time 12 "${base}/health" >"${out_dir}/health.json"
  curl -fsS --max-time 15 "${base}/v1/anomaly?priority=P1&improvementLimit=5" >"${out_dir}/p1.json"
  curl -fsS --max-time 12 "${base}/v1/corporate" >"${out_dir}/corporate.json"
  python3 - "$out_dir" <<'PY'
import json, sys
from pathlib import Path
d = Path(sys.argv[1])
anom = json.loads((d / "p1.json").read_text())
assert anom.get("classified") is False
assert anom.get("liveSurveillance") is False
assert anom["summary"]["p1Events"] >= 1
corp = json.loads((d / "corporate.json").read_text())
assert any(w["id"] == "sigint-intercepts" for w in corp["wontDo"])
print(
    "SCAN OK",
    anom["summary"]["p1Events"],
    "P1 events,",
    anom["summary"]["improvements"],
    "improvements,",
    "intercepts=false",
)
PY
  if [[ "${i}" -lt "${loops}" && "${sleep_s}" -gt 0 ]]; then
    sleep "${sleep_s}"
  fi
done

echo "SCAN-PIPELINE OK — wrote ${out_dir}/p1.json (fixtures only)"
