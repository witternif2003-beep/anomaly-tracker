#!/usr/bin/env bash
# Audit: business-crime taxonomy must stay complete for company scans.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

json="${TRACKER_STATIC_JSON:-$root/public/static/anomaly.json}"
src="$root/data/anomaly/business-crime-taxonomy.json"
if [[ ! -f "$json" ]]; then
  npx --no-install tsx scripts/generate-static-site-data.ts
fi

python3 - "$src" "$json" <<'PY'
import json, sys
src_path, bake_path = sys.argv[1], sys.argv[2]
with open(src_path, encoding="utf-8") as f:
    src = json.load(f)
with open(bake_path, encoding="utf-8") as f:
    bake = json.load(f)

errors = []
cats = src.get("categories") or []
cases = src.get("cases") or []
if len(cats) != 52:
    errors.append(f"source categories expected 52, got {len(cats)}")
if len(cases) != 60:
    errors.append(f"source cases expected 60, got {len(cases)}")

required = [
    "Accounting Fraud / Financial Statement Fraud",
    "Securities Fraud",
    "Wire Fraud",
    "Money Laundering",
    "Investment Fraud",
    "Ponzi Schemes",
    "Business Email Compromise (BEC)",
    "Corporate Fraud",
    "Insider Trading",
    "Market Manipulation",
    "Antitrust Violations (Price-Fixing, Bid-Rigging)",
    "Foreign Corrupt Practices Act (FCPA) Violations",
    "Healthcare Fraud",
    "Bank Fraud",
    "Tax Fraud",
    "Trade Secret Theft",
    "Cybercrime",
    "Government Fraud (PPP, Section 8)",
    "Crypto Fraud / Cryptocurrency Scams",
    "Offering Fraud",
    "False Books and Records",
    "Misappropriation of Funds",
    "Embezzlement",
    "Kickbacks / Bribery",
    "Disclosure Fraud",
    "Economic Espionage",
    "Consumer Fraud",
    "Insurance Fraud",
    "Mortgage Fraud",
    "Procurement Fraud",
    "Racketeering (RICO)",
    "Identity Theft",
    "Phishing",
    "Extortion",
    "Confidence and Romance Scams",
    "Document Fraud",
    "AI-Facilitated Fraud",
    "Data Theft / Data Misuse",
    "Breach of Confidentiality",
    "Trade Secret Betrayal",
    "Corruption",
    "Manipulation",
    "Fraud",
    "Unfair Commercial Practices",
    "Labor Standards Violation",
    "Commodities Fraud",
    "Futures Fraud",
    "Options Fraud",
    "Benchmark Manipulation",
    "Sanctions Evasion",
]
labels = {c.get("label") for c in cats}
for label in required:
    if label not in labels:
        errors.append(f"missing category: {label}")

for c in cats:
    if c.get("priority") not in {"P1", "P2", "P3"}:
        errors.append(f"category {c.get('id')} missing P1/P2/P3 priority")

must_cases = [
    "CaaStle founder sentenced for $300M fraud scheme",
    "ADM and former executives charged with accounting fraud",
    "Ex-BofA banker pleads guilty in $8B Medicare fraud scheme",
    "Ga. financial firm CEO pleads guilty to $380M Ponzi scheme",
    "First Brands executives charged with multibillion-dollar fraud",
    "Sealed Letter Halts Sentencing Of 50 Cent's Ex-Associate",
]
titles = {c.get("title") for c in cases}
for t in must_cases:
    if t not in titles:
        errors.append(f"missing case: {t}")

catalog = bake.get("businessCrimeCatalog") or {}
bot = bake.get("blackOwnedScanBot") or {}
if catalog.get("categoryCount") != 52 or catalog.get("caseCount") != 60:
    errors.append(
        f"baked catalog expected 52/60, got {catalog.get('categoryCount')}/{catalog.get('caseCount')}"
    )
if bot.get("crimeCategoryCount") != 52 or bot.get("crimeCaseCount") != 60:
    errors.append(
        f"scan bot expected 52/60, got {bot.get('crimeCategoryCount')}/{bot.get('crimeCaseCount')}"
    )
crime = [s for s in (bot.get("stream") or []) if s.get("crimeCategoryId")]
searched = {s.get("crimeCategoryId") for s in crime}
if len(searched) != 52:
    errors.append(f"scan stream covers {len(searched)} categories, expected 52")
prio_ok = all((s.get("priority") or s.get("target", {}).get("priority")) in {"P1", "P2", "P3"} for s in crime)
if not prio_ok:
    errors.append("crime scan ticks missing P1/P2/P3 priority labels")
if bot.get("liveCrimeFeeds"):
    errors.append("liveCrimeFeeds must be false")

if errors:
    print("PIPELINE FAIL business-crime-audit")
    for e in errors:
        print(" -", e)
    sys.exit(1)

print(
    "PIPELINE OK business-crime-audit",
    f"categories=52 cases=60 scannedCats={len(searched)}",
    f"companies={len({s['target']['id'] for s in crime})}",
    f"crimeTicks={len(crime)}",
)
PY
