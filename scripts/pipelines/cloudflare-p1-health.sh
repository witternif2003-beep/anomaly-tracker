#!/usr/bin/env bash
# P1 catalog health through the local API and optional CI-gate worker origin.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

base="${P1_HEALTH_URL:-http://127.0.0.1:4040}"

python3 - "$base" <<'PY'
import json, sys, urllib.request
base = sys.argv[1]
p1 = json.load(urllib.request.urlopen(base + "/v1/p1?limit=5", timeout=8))
assert p1["totalSlots"] >= 1000, p1["totalSlots"]
row = p1["data"][0]
for key in ("skillId", "agentId", "resource", "workerPath"):
    assert row.get(key), f"missing {key}"
assert row["resource"]["path"]
print("PIPELINE OK cloudflare-p1-health", p1["totalSlots"], "slots", "skill", row["skillId"], "agent", row["agentId"])
PY
