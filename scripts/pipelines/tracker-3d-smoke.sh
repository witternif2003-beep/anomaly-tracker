#!/usr/bin/env bash
# Post-doc pipeline smoke: orbital globe scene + postdoc-500 + telemetry bake.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

json="${TRACKER_STATIC_JSON:-$root/public/static/anomaly.json}"
if [[ ! -f "$json" ]]; then
  npx --no-install tsx scripts/generate-static-site-data.ts
fi

python3 - "$json" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    d = json.load(f)

errors = []
scene = d.get("scene") or {}
nodes = scene.get("nodes") or []
events = scene.get("events") or []
postdoc = d.get("postdocCatalog") or {}
telemetry = d.get("telemetry") or {}
health = d.get("pipelineHealth") or {}
summary = d.get("summary") or {}

if not scene.get("populated"):
    errors.append("scene.populated missing/false")
if len(nodes) < 1:
    errors.append("scene.nodes empty")
if len(events) < 1:
    errors.append("scene.events empty")
for n in nodes:
    if not isinstance(n.get("lat"), (int, float)) or not isinstance(n.get("lon"), (int, float)):
        errors.append(f"node {n.get('id')} missing lat/lon")
        break
for e in events[:5]:
    if not isinstance(e.get("lat"), (int, float)) or not isinstance(e.get("lon"), (int, float)):
        errors.append(f"event {e.get('id')} missing lat/lon")
        break
if postdoc.get("total") != 500 or len(postdoc.get("data") or []) != 500:
    errors.append(f"postdocCatalog expected 500, got total={postdoc.get('total')} data={len(postdoc.get('data') or [])}")
if summary.get("postdocImprovements") != 500:
    errors.append("summary.postdocImprovements != 500")
if not telemetry.get("active"):
    errors.append("telemetry.active false")
if (telemetry.get("totalTicks") or 0) < 1:
    errors.append("telemetry.totalTicks empty")
checks = health.get("checks") or []
if checks and not all(c.get("ok") for c in checks):
    bad = [c["id"] for c in checks if not c.get("ok")]
    errors.append(f"pipelineHealth failed: {bad}")

if errors:
    print("PIPELINE FAIL tracker-3d-smoke")
    for e in errors:
        print(" -", e)
    sys.exit(1)

print(
    "PIPELINE OK tracker-3d-smoke",
    f"nodes={len(nodes)} events={len(events)} postdoc=500",
    f"telemetryTicks={telemetry.get('totalTicks')} health={len(checks)}",
)
PY
