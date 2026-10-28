# OMEGA Protocol — Operations

Continuous-batch exposure register for defensive operations. Each batch reads three public vulnerability sources, numbers new anomalies in sequence, opens incidents above an exposure threshold, charges a simulated compute-unit treasury, and seals the outcome into a SHA-256 hash-chained audit trail. Every figure on screen comes from a source record or from the platform's own measured runtime; anything a source does not publish is shown as `—`.

## Batch graph

`catalog_fetch` → `attribute`; `catalog_fetch` + `window_fetch` + `attribute` → `correlate` → `enrich` → `predict` → `persist` → `incidents` → `narrate` → `settle`

| Stage | Reads / writes |
| --- | --- |
| catalog_fetch | Exploited-vulnerability catalog JSON (cisa.gov) |
| window_fetch | Newest 100 CVE records modified in the last `NVD_WINDOW_HOURS` (nvd.nist.gov CVE API 2.0); degrades, not fails, if the API is slow |
| attribute | CVE links to groups and campaigns that MITRE ATT&CK describes as espionage actors (attack-stix-data Enterprise bundle, refreshed at most every 24 h; ~55 MB, charged as its own simulated-ledger line against the daily limit) |
| correlate | Up to 60 candidates: unseen, catalogued in the last 30 days, modified in the window, or unseen with an espionage attribution |
| enrich | Severity from the window, plus up to 5 direct record lookups per batch |
| predict | 30-day exploitation probability and percentile (api.first.org EPSS) |
| persist | Upsert into `ops_finding` with raw source payloads and a record digest |
| incidents | Open an incident at exposure ≥ 60 (p1 ≥ 85, p2 ≥ 72) |
| narrate | Deterministic narrative built from the persisted rows |
| settle | Charge `2 + MiB read` simulated units, enforce limits, append audit entry |

Exposure index = `min(100, 40·EPSS + 4·CVSS + 15 if catalogued + 5 if extortion use is known)`.

## Cadence

Daily scheduler run (`vercel.json`), operator "run batch now", and a freshness trigger: a Command page view starts a batch when the newest one is older than `BATCH_STALE_MIN` (default 30) minutes.

## Safeguards

- Operator passphrase → HMAC-signed httpOnly session (admin). API keys (viewer/operator) stored as SHA-256 digests, revocable. Scheduler secret for `/api/cron/batch`.
- All writes require a role and are appended to the audit chain; `/audit` re-verifies the chain from genesis.
- Per-batch and daily spending limits on simulated units, checked before and after each batch.
- Records describe products and vulnerabilities only. No personal data is collected or displayed.

## Run

```bash
cp .env.example .env.local   # DATABASE_URL, SESSION_SECRET (32+), OPERATOR_PASSPHRASE (12+), CRON_SECRET (16+)
npm install
npm run dev                  # schema is applied on first database access
npm run lint && npm run typecheck && npm test && npm run build
```

## Espionage attribution

Each full anomaly record carries an ESPIONAGE ATTRIBUTION row. It lists only ATT&CK groups and campaigns whose own ATT&CK description (or the group a campaign is attributed to) calls them espionage actors, and only where an ATT&CK relationship or description names the CVE. Each entry shows the ATT&CK statement, its cited reports, and the ATT&CK page. OMEGA adds no attribution of its own; a record with no ATT&CK link says so.

MITRE ATT&CK® content: © 2026 The MITRE Corporation. This work is reproduced and distributed with the permission of The MITRE Corporation. Licence: https://attack.mitre.org/resources/legal-and-branding/terms-of-use/

