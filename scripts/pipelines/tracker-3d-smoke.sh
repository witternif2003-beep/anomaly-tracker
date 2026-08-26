#!/usr/bin/env bash
# Post-doc pipeline smoke: orbital globe scene + postdoc-365500 virtual + TOP 500 SOTA + Live P1 + Error scout self-heal bake.
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
if postdoc.get("total") != 365500:
    errors.append(f"postdocCatalog expected total=365500, got {postdoc.get('total')}")
if not postdoc.get("virtualExpand"):
    errors.append("postdocCatalog.virtualExpand required for 365.5k Pages-safe catalog")
if not postdoc.get("expandSeed"):
    errors.append("postdocCatalog.expandSeed missing")
if not postdoc.get("trackerTab"):
    errors.append("postdocCatalog.trackerTab must be true")
top500 = [x for x in (postdoc.get("data") or []) if x.get("sotaTier") == "top500-sota" or (x.get("sotaRank") or 0) > 0]
if len(top500) != 500:
    errors.append(f"postdoc TOP 500 SOTA expected 500, got {len(top500)}")
if len(postdoc.get("data") or []) < 500:
    errors.append(f"postdoc baked window underfilled ({len(postdoc.get('data') or [])})")
if summary.get("postdocImprovements") != 365500:
    errors.append("summary.postdocImprovements != 365500")
if not telemetry.get("active"):
    errors.append("telemetry.active false")
if (telemetry.get("totalTicks") or 0) < 1:
    errors.append("telemetry.totalTicks empty")
if (telemetry.get("p1Ticks") or 0) < 1:
    errors.append("telemetry.p1Ticks empty — Live P1 stream required")
if "liveSurveillance" in telemetry and telemetry.get("liveSurveillance") is True:
    errors.append("telemetry.liveSurveillance must stay false")
checks = health.get("checks") or []
if checks and not all(c.get("ok") for c in checks):
    bad = [c["id"] for c in checks if not c.get("ok")]
    errors.append(f"pipelineHealth failed: {bad}")

packets = d.get("mayForensicPackets") or {}
if len(packets) != len(nodes):
    errors.append(f"mayForensicPackets expected {len(nodes)} entities, got {len(packets)}")
for nid in (n.get("id") for n in nodes):
    pkt = packets.get(nid)
    if not pkt:
        errors.append(f"missing May packet for {nid}")
        break
    cats = pkt.get("categories") or []
    if len(cats) < 10:
        errors.append(f"{nid} May packet has {len(cats)} categories (need 10)")
        break
    if (pkt.get("elementCount") or 0) < 20:
        errors.append(f"{nid} May packet elementCount too low")
        break
may = (d.get("evidenceMap") or {}).get("mayPacket") or {}
if not may.get("everyEntityHasFullPacket"):
    errors.append("evidenceMap.mayPacket.everyEntityHasFullPacket false")

bot = d.get("blackOwnedScanBot") or {}
if not bot.get("active"):
    errors.append("blackOwnedScanBot.active false")
if (bot.get("verifiedCount") or 0) < 1:
    errors.append("blackOwnedScanBot.verifiedCount empty")
if (bot.get("candidateCount") or 0) < 12:
    errors.append("blackOwnedScanBot.candidateCount too low")
if (bot.get("discoveryPoolCount") or 0) < 24:
    errors.append("blackOwnedScanBot.discoveryPoolCount too low")
if not bot.get("autoQueueOnDiscover"):
    errors.append("blackOwnedScanBot.autoQueueOnDiscover false")
if (bot.get("queueLength") or 0) < 1:
    errors.append("blackOwnedScanBot.queueLength empty")
if len(bot.get("stream") or []) < 10:
    errors.append("blackOwnedScanBot.stream too short for 24/7 log")
if bot.get("liveSurveillance") or bot.get("liveCertQueries"):
    errors.append("blackOwnedScanBot must not enable live surveillance/CERT")
if (bot.get("crimeCategoryCount") or 0) != 52:
    errors.append(f"crimeCategoryCount expected 52, got {bot.get('crimeCategoryCount')}")
if (bot.get("crimeCaseCount") or 0) != 60:
    errors.append(f"crimeCaseCount expected 60, got {bot.get('crimeCaseCount')}")
crime_ticks = [s for s in (bot.get("stream") or []) if s.get("status") in ("crime-search", "documented")]
if len(crime_ticks) < 1 and (bot.get("crimeLedgerCount") or 0) < 52:
    errors.append("blackOwnedScanBot missing crime search coverage")
if (bot.get("crimeLedgerCount") or bot.get("metrics", {}).get("crimeTicks") or len(crime_ticks)) < 52:
    errors.append("blackOwnedScanBot crime ledger/ticks < 52")
auto_ticks = [s for s in (bot.get("stream") or []) if s.get("status") == "auto-queued"]
if len(auto_ticks) < 12:
    errors.append("blackOwnedScanBot missing auto-queued ticks")
hardening = bot.get("hardening") or {}
if (hardening.get("gateCount") or 0) < 50:
    errors.append("blackOwnedScanBot hardening gates < 50")
if (hardening.get("hardeningScore") or 0) < 95:
    errors.append("blackOwnedScanBot hardeningScore < 95")
if not hardening.get("allOk"):
    errors.append("blackOwnedScanBot hardening.allOk false")
if not bot.get("integrityHash"):
    errors.append("blackOwnedScanBot.integrityHash missing")
if not summary.get("blackOwnedAutoQueue"):
    errors.append("summary.blackOwnedAutoQueue false")

catalog = d.get("businessCrimeCatalog") or {}
if (catalog.get("categoryCount") or 0) != 52:
    errors.append("businessCrimeCatalog.categoryCount != 52")
if (catalog.get("caseCount") or 0) != 60:
    errors.append("businessCrimeCatalog.caseCount != 60")
if catalog.get("liveFeeds"):
    errors.append("businessCrimeCatalog.liveFeeds must be false")

scout = d.get("scoutBot") or {}
if not scout.get("active"):
    errors.append("scoutBot.active false")
if not scout.get("selfHealing"):
    errors.append("scoutBot.selfHealing false")
if not scout.get("additiveOnly"):
    errors.append("scoutBot.additiveOnly false")
if not scout.get("extremeScan"):
    errors.append("scoutBot.extremeScan false")
if not scout.get("hiddenCodeScan"):
    errors.append("scoutBot.hiddenCodeScan false")
if not scout.get("repairRescan"):
    errors.append("scoutBot.repairRescan false")
if (scout.get("repairRescanPasses") or 0) < 3:
    errors.append("scoutBot.repairRescanPasses < 3")
if scout.get("mode") not in ("postdoc-extreme-24x7", "postdoc-x3-extreme-24x7"):
    errors.append("scoutBot.mode not postdoc-x3-extreme")
if len(scout.get("healActions") or []) < 6:
    errors.append("scoutBot.healActions incomplete (<6)")
if (scout.get("tickMs") or 9999) > 67:
    errors.append("scoutBot.tickMs not ≤67 (×3 harder)")
if (scout.get("gateTarget") or 0) < 405:
    errors.append("scoutBot.gateTarget < 405")
if scout.get("liveSurveillance"):
    errors.append("scoutBot must not enable live surveillance")
if not summary.get("scoutBotActive"):
    errors.append("summary.scoutBotActive false")
if len(checks) < 20:
    errors.append(f"pipelineHealth.checks underfilled ({len(checks)} < 20)")
code = d.get("scoutCodeIntegrity") or {}
if not code.get("allOk"):
    errors.append("scoutCodeIntegrity.allOk false")
if (code.get("gateCount") or 0) < 24:
    errors.append("scoutCodeIntegrity.gateCount < 24")

if errors:
    print("PIPELINE FAIL tracker-3d-smoke")
    for e in errors:
        print(" -", e)
    sys.exit(1)

print(
    "PIPELINE OK tracker-3d-smoke",
    f"nodes={len(nodes)} events={len(events)} postdoc=365500 top500-sota live-p1 scout-self-heal virtual",
    f"telemetryTicks={telemetry.get('totalTicks')} health={len(checks)}",
    f"mayPackets={len(packets)} mayCats={may.get('categoryCount')}",
    f"boBot={bot.get('verifiedCount')}+{bot.get('candidateCount')}+pool{bot.get('discoveryPoolCount')} stream={len(bot.get('stream') or [])} harden={hardening.get('hardeningScore')}",
    f"crime={catalog.get('categoryCount')}cats/{catalog.get('caseCount')}cases",
    f"scout={scout.get('mode')} healed-actions={len(scout.get('healActions') or [])}",
)
PY
