---
name: wh-tracker-stack-testing
description: How to bring up and end-to-end test the standalone wh-tracker docker-compose stack (3D Three.js viewer, PDF service, pipeline scheduler, Prometheus/Alertmanager/Grafana) in this repo.
---

# Testing the wh-tracker stack

`wh-tracker/` is a standalone CommonJS Node project, independent of the root Next.js app. Do not run
root `npm` scripts for it.

## Bring-up

```bash
cd <repo>/wh-tracker
cp .env.example .env
# API_KEY and GRAFANA_PASSWORD are empty in the example and compose fails fast without them:
printf 'API_KEY=%s\nGRAFANA_PASSWORD=%s\n' "$(openssl rand -hex 32)" "testpass" >> .env
docker compose up -d --build
```

- Clean-state run: `docker compose down -v` (state and logs live in the named volumes
  `tracker-data`, `tracker-logs`, `pdf-logs`, `scheduler-logs`, not in the checkout). A fresh volume
  re-seeds 5 entities / 4 links / 0 anomalies, after which the treasury pipeline (the only one
  enabled without API keys) adds ~1 entity + 1 low anomaly within ~35s.
- Ports: tracker + viewer 3000 and grafana 3001 (admin / `$GRAFANA_PASSWORD`) on all interfaces;
  pdf-service 4005, prometheus 9090 and alertmanager 9093 are bound to `127.0.0.1` (override with
  `PDF_BIND`/`PROMETHEUS_BIND`/`ALERTMANAGER_BIND`). Scheduler has no published port; reach its
  status server with
  `docker exec wh-tracker-scheduler-1 node -e "fetch('http://127.0.0.1:4010/health').then(r=>r.text()).then(console.log)"`.
- All six services define healthchecks, so `docker compose ps` should reach `(healthy)` except
  `scheduler` (no port).
- `npm run smoke` from `wh-tracker/` (after `set -a && . ./.env && set +a`) runs 10 HTTP checks
  against tracker + pdf-service and is the fastest regression signal.
- Pipeline exit codes: `docker compose exec scheduler node src/pipeline-scheduler.js --once
  --pipeline=treasury` exits 1 when the pipeline errors (force one with `-e USASPENDING_URL=http://127.0.0.1:9`).

## Exercising the feature

- Load env for API calls: `set -a && . ./.env && set +a`, then use `-H "x-api-key: $API_KEY"`.
- Live websocket proof: `POST /api/anomalies` with a `critical` severity and high `score`; the open
  viewer tab must update HUD counters, prepend a red feed card and recolour the target entity's node
  with no reload (viewer subscribes to `/ws` and refetches `/api/summary` on each message).
- Mutating routes (`/api/anomalies`, `/api/entities`, `/api/links`, `/api/report`) return 401 on
  missing/wrong key and 400 on invalid title/severity/score.
- PDF: `POST /api/report` (tracker) proxies to pdf-service `/render` (puppeteer-core + system
  `/usr/bin/chromium`). Verify readability by opening the saved PDF in Chrome — `pdftotext` may not
  be installed on the box. `POST /api/preview`-equivalent is pdf-service `POST /preview`, which
  returns the same HTML and needs a full `{title,summary,anomalies}` body.
- Grafana dashboard `WH Tracker overview` (uid `wh-tracker-overview`) is provisioned automatically.
  Because tracker/pdf-service/scheduler all expose the same metric names from a shared registry,
  unpinned queries like `wh_topology_nodes` return 3 series (two of them 0). Panel queries must stay
  pinned to `job="tracker"`; verify with
  `curl -s --data-urlencode 'query=wh_ws_clients' localhost:9090/api/v1/query` and by counting
  legend entries in the "Topology size" and "Websocket clients & PDF renders" panels.
- `increase(wh_pdf_reports_total[1h])` reads ~0 right after a single render; issue 3-4 renders and
  wait one scrape interval (15s) before judging that panel.
- Pipeline freshness: the scheduler publishes `wh_pipeline_enabled{pipeline}` and
  `wh_scheduler_start_timestamp_seconds` at startup, so `PipelineStale` can fire for enabled
  pipelines that never succeeded. Validate rule edits with
  `docker run --rm --entrypoint promtool -v $PWD/prometheus:/p prom/prometheus:v3.1.0 check rules /p/rules/alerts.yml`.
- Treasury/OTX anomalies use deterministic ids, so re-running a pipeline must not grow
  `/api/summary`'s anomaly count.
- Posting a `critical` anomaly also fires the `CriticalAnomalyDetected` rule, visible in
  Alertmanager at :9093 within ~1 min — a good extra end-to-end signal.

## Devin Secrets Needed

None. `FEC_API_KEY`/`OTX_API_KEY` are optional; without them those pipelines report `skipped`
(expected). `API_KEY`/`GRAFANA_PASSWORD` are generated locally for the test run.
