# OMEGA Protocol — Operations

Continuous-batch exposure register for defensive operations. Each batch reads three public vulnerability sources, numbers new anomalies in sequence, opens incidents above an exposure threshold, charges a simulated compute-unit treasury, and seals the outcome into a SHA-256 hash-chained audit trail. Every figure on screen comes from a source record or from the platform's own measured runtime; anything a source does not publish is shown as `—`.

## Batch graph

`catalog_fetch` + `window_fetch` → `correlate` → `enrich` → `predict` → `persist` → `incidents` → `narrate` → `settle`

| Stage | Reads / writes |
| --- | --- |
| catalog_fetch | Exploited-vulnerability catalog JSON (cisa.gov) |
| window_fetch | Newest 100 CVE records modified in the last `NVD_WINDOW_HOURS` (nvd.nist.gov CVE API 2.0); degrades, not fails, if the API is slow |
| correlate | Up to 60 candidates: unseen, catalogued in the last 30 days, or modified in the window |
| enrich | Severity from the window, plus up to 5 direct record lookups per batch |
| predict | 30-day exploitation probability and percentile (api.first.org EPSS) |
| persist | Upsert into `ops_finding` with raw source payloads and a record digest |
| incidents | Open an incident at exposure ≥ 60 (p1 ≥ 85, p2 ≥ 72) |
| narrate | Deterministic narrative built from the persisted rows |
| settle | Charge `2 + MiB read` simulated units, enforce limits, append audit entry |

Exposure index = `min(100, 40·EPSS + 4·CVSS + 15 if catalogued + 5 if extortion use is known)`.

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
