#!/usr/bin/env bash
# Continuous-discovery regression: the baked pool is a seed, never a ceiling.
# Fails if discovery can ever freeze — no growth, repeated businesses, lost
# counters on reload, unbounded render state, or an unlabelled "live" claim.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

json="${TRACKER_STATIC_JSON:-$root/public/static/anomaly.json}"
if [[ ! -f "$json" ]]; then
  npx --no-install tsx scripts/generate-static-site-data.ts
fi

# 1. The bake must carry the synthesis seed the client expands from.
python3 - "$json" <<'PY'
import json, sys

with open(sys.argv[1], encoding="utf-8") as f:
    d = json.load(f)

errors = []
bot = d.get("blackOwnedScanBot") or {}
syn = bot.get("discoverySynthesis") or {}

for field, floor in (
    ("namePrefixes", 8),
    ("nameCores", 8),
    ("nameSuffixes", 4),
    ("cities", 3),
    ("sectors", 3),
    ("entityTypes", 2),
    ("channels", 2),
    ("categories", 10),
):
    got = len(syn.get(field) or [])
    if got < floor:
        errors.append(f"discoverySynthesis.{field} has {got}, need >= {floor}")

if not syn.get("epochMs"):
    errors.append("discoverySynthesis.epochMs missing — growth must anchor to wall clock")
if (syn.get("tickMs") or 0) <= 0:
    errors.append("discoverySynthesis.tickMs missing")
if "fixture" not in (syn.get("note") or "").lower():
    errors.append("discoverySynthesis.note must state rows are fixture synthesis")

# Unbounded corpus: prefixes*cores*suffixes*cities must dwarf the baked pool.
period = 1
for field in ("namePrefixes", "nameCores", "nameSuffixes", "cities"):
    period *= max(1, len(syn.get(field) or []))
if period < 10000:
    errors.append(f"synthesis period {period} too small for continuous discovery")

# Live claims stay off while counters climb.
for flag in ("liveSurveillance", "liveCertQueries", "liveCrimeFeeds"):
    if bot.get(flag) is True:
        errors.append(f"blackOwnedScanBot.{flag} must stay false")

if errors:
    print("PIPELINE FAIL continuous-discovery (bake)")
    for e in errors:
        print(" -", e)
    sys.exit(1)

print(f"bake ok · synthesis period={period} categories={len(syn.get('categories') or [])}")
PY

# 2. The synthesis library itself: growth, uniqueness, monotonicity.
npx --no-install tsx "$root/scripts/continuous-discovery-check.ts"

# 3. Client wiring must synthesize past pool exhaustion with bounded render state.
for needle in synthesizeBusiness synthesizeViolation discoveryStore QUEUE_RENDER_CAP; do
  grep -q "$needle" src/components/lyra/black-owned-scan-bot.tsx ||
    { echo "PIPELINE FAIL continuous-discovery — scan bot missing $needle"; exit 1; }
done
grep -q "continuous-discovery-stalled" src/lib/scout-healer.ts ||
  { echo "PIPELINE FAIL continuous-discovery — scout stall gate missing"; exit 1; }

echo "PIPELINE OK continuous-discovery unbounded-synthesis monotonic wall-clock-anchored bounded-dom fixture-labelled"
