# WH Anomaly Tracker

Full stack for tracking funding/award anomalies across entities, with a live 3D topology
viewer, PDF reporting, open-data enrichment pipelines and a Prometheus/Grafana monitoring
plane. Everything runs from one `docker compose` file on a single VPS.

| Service | Port | Purpose |
| --- | --- | --- |
| `tracker` | 3000 | Express + WebSocket API and the Three.js topology viewer |
| `pdf-service` | 4005 | Headless-Chromium PDF report renderer |
| `scheduler` | 4010 | Runs the FEC / Treasury / OTX pipelines on an interval |
| `prometheus` | 9090 | Scrapes `/metrics` from the three Node services, evaluates alert rules |
| `alertmanager` | 9093 | Routes alerts (receivers are placeholders — point them at Slack/email) |
| `grafana` | 3001 | Provisioned "WH Tracker overview" dashboard |

## Deploy on a VPS

```bash
git clone https://github.com/witternif2003-beep/wh-tracker.git
cd wh-tracker

cp .env.example .env
# API_KEY and GRAFANA_PASSWORD ship empty and compose refuses to start until they
# are set — generate them, do not reuse the example file's values.
printf 'API_KEY=%s\nGRAFANA_PASSWORD=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -base64 24)" >> .env
$EDITOR .env

docker compose up -d --build

curl http://localhost:3000/api/health   # 3D viewer + API
curl http://localhost:4005/health       # PDF service
curl http://localhost:3001/api/health   # Grafana
```

Then browse the viewer at `http://<host>:3000` and Grafana at `http://<host>:3001`
(`admin` / `GRAFANA_PASSWORD`). In the viewer: drag to orbit, scroll to zoom, hover a node
for its detail, and press `H` to hide/show the wireframe White House at the centre of the
scene.

Only the viewer (3000) and Grafana (3001) are published on all interfaces. `pdf-service`,
Prometheus and Alertmanager bind to `127.0.0.1` because they are unauthenticated (and
Chromium runs with `--no-sandbox`); override `PDF_BIND` / `PROMETHEUS_BIND` /
`ALERTMANAGER_BIND` only behind a reverse proxy with TLS and authentication.

The viewer's read paths (`GET /api/*`, `/ws`) are intentionally unauthenticated so the
dashboard works without a login — they disclose topology, anomalies and evidence to anyone
who can reach port 3000. If the data is sensitive, front the tracker with proxy auth (or set
`TRACKER_BIND=127.0.0.1`) rather than exposing it publicly.

`/ws` upgrades are still restricted by `Origin`: same-origin requests and non-browser clients
pass, anything else has to be listed in `ALLOWED_ORIGINS` (comma-separated), so a third-party
page cannot read the feed through a visitor's browser.

Grafana and the viewer are published over plain HTTP, so a remote Grafana login sends its
credentials in the clear. Terminate TLS at a reverse proxy (or set `GRAFANA_BIND=127.0.0.1`
and tunnel) before logging in from anywhere but the host itself.

## Configuration

All settings come from `.env` (see `.env.example`). `*.env` is gitignored; never commit real
keys.

| Variable | Required | Notes |
| --- | --- | --- |
| `API_KEY` | yes | Shared secret for every mutating `/api` route (`X-API-Key` header) |
| `GRAFANA_PASSWORD` | yes | Grafana admin password |
| `FEC_API_KEY`, `FEC_COMMITTEE_IDS` | for FEC pipeline | Comma-separated committee ids, e.g. `C00401224` |
| `TAXII_URL`, `TAXII_USER`, `TAXII_PASS` | optional | STIX bundles are published here; publishing is skipped when unset |
| `OTX_API_KEY`, `OTX_INDICATORS` | for OTX pipeline | Indicators as `domain:example.com,ip:8.8.8.8` |
| `*_INTERVAL_MINUTES` | optional | Per-pipeline schedule (FEC 360, Treasury 720, OTX 180) |
| `ALLOWED_ORIGINS` | optional | Extra browser origins allowed to open `/ws` (same-origin always passes) |
| `*_BIND`, `*_PORT` | optional | Host interface/port per published service |
| `FEC_MAX_PAGES` | optional | Schedule A pages to walk per committee (default 10) |

## API

```
GET  /api/health                      liveness
GET  /api/summary                     counts by severity, max score
GET  /api/topology                    entities + links for the 3D graph
GET  /api/anomalies?severity=&limit=  anomaly feed
POST /api/anomalies                   record an anomaly            (X-API-Key)
POST /api/entities  POST /api/links   extend the graph             (X-API-Key)
POST /api/report                      render a PDF via pdf-service (X-API-Key)
GET  /metrics                         Prometheus exposition
WS   /ws                              snapshot on connect, then anomaly/topology events
```

```bash
curl -X POST http://localhost:3000/api/anomalies \
  -H "content-type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"title":"Sole-source award spike","severity":"high","score":78,"entityId":"ent-vendor-a"}'

curl -X POST http://localhost:3000/api/report \
  -H "content-type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"title":"Weekly review"}' -o report.pdf
```

State lives in `data/state.json` (atomic writes, seeded with a small demo graph on first
boot); structured JSON logs are written to `logs/<service>.log`. Under compose both live in
named volumes (`tracker-data`, `*-logs`) so persistence does not depend on the checkout
being writable by the image's non-root user — read logs with `docker compose logs` or
`docker run --rm -v wh-tracker_tracker-logs:/logs busybox cat /logs/tracker.log`.

## Pipelines

- `fec-taxii-pipeline.js` — FEC Schedule A receipts → large-contribution anomalies →
  deterministic STIX 2.1 bundle → optional TAXII 2.1 `POST /objects/`.
- `src/treasury-api.js` — USAspending.gov top recipients per fiscal year, flags award
  concentration outliers at `mean + σ·stddev`.
- `src/otx-enrichment.js` — AlienVault OTX indicator lookups, severity from pulse count.
- `src/pipeline-scheduler.js` — interval scheduler with startup jitter; exposes
  `/health` (per-pipeline last run) and `/metrics` on 4010.

Run one pipeline manually:

```bash
node src/pipeline-scheduler.js --once --pipeline=treasury
node fec-taxii-pipeline.js
```

## Local development

```bash
npm install
cp .env.example .env && $EDITOR .env
node server.js          # http://localhost:3000
node pdf-service.js     # http://localhost:4005 (needs CHROME_PATH or a distro chromium)
npm run smoke           # end-to-end checks against both services
npm run lint            # syntax check of every entrypoint
```

## Monitoring

`prometheus/rules/alerts.yml` ships availability alerts (`ServiceDown`,
`HighHttpErrorRate`, `PdfRenderFailures`), pipeline freshness alerts (`PipelineStale`,
`UpstreamApiErrors`) and signal alerts (`CriticalAnomalyDetected`, `AnomalyScoreSpike`).
The Alertmanager receivers are deliberately inert placeholders — swap them for
`slack_configs`/`email_configs` before relying on paging.

Grafana auto-provisions the Prometheus datasource and the overview dashboard from
`grafana/provisioning`.
