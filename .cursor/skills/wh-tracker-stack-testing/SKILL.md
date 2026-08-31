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

## Viewer specifics (3D scene)

- The viewer draws a procedural wireframe White House (`whiteHouse` IIFE in `public/index.html`) at the
  scene origin from `THREE.LineSegments`; `h`/`H` on `window` toggles `whiteHouse.visible`. Click the
  canvas first so the page (not the URL bar) has focus before pressing `H`.
- The scene slowly auto-orbits, so two screenshots taken seconds apart differ even with no input —
  judge drag/zoom by large deliberate changes, and capture drags with the button still held.
- Node layout radius is `max(14, entities*1.9)` while the building spans roughly ±20 units, so with a
  small topology some entity spheres legitimately sit inside/next to the wings. That is expected, not
  a bug; the wireframe stays see-through (opacity 0.4-0.55).
- Websocket origin check (`originAllowed`/`verifyClient` in `server.js`) is easy to probe without a
  browser:
  `curl -m 3 -i -N --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' [-H 'Origin: ...'] http://localhost:3000/ws`
  → 101 for no Origin / same origin, 403 otherwise; add `ALLOWED_ORIGINS=<origin>` to allow a foreign
  one (test on a temp instance with a different `PORT`). Always pass `-m` — a successful upgrade hangs.
- NEVER run `pkill -f "node server.js"` on the host to stop a temp instance: container processes are
  visible in the host PID table and it kills the tracker container too. Use the shell job id or a
  unique `PORT=xxxx` marker in the pattern.

## Vercel variant (`wh-tracker-vercel/`)

- Same viewer, but no docker: it is deployed on Vercel (e.g. https://wh-tracker-vercel.vercel.app) and
  is public — test the deployed URL in the browser, no local server needed. Confirm the deployment is
  current with `diff <(cat public/index.html) <(curl -s <url>/)`.
- Three.js is vendored and served same-origin from `/vendor/three.module.js` (~1.3 MB); a 404 there or
  a "Failed to resolve module specifier" console error means the vendor step (`scripts/vendor-three.mjs`)
  did not run.
- Websocket is replaced by SSE: `EventSource("/api/sse/stream")`. The function self-closes at
  `SSE_MAX_DURATION_S` (50s) emitting `event: reconnect`, and the client restarts after 1s. Prove it in
  the DevTools Network panel: repeated `stream` rows each ending at ~50.1s. The status indicator's
  "reconnecting…" state lasts ~1s and is very hard to screenshot — don't treat a missing frame as a bug.
- `lib/store.js` is in-memory per serverless instance unless a Neon DB is configured (`/api/health`
  reports `store: "memory"`), so a POSTed anomaly usually will NOT appear in an open viewer. Expected.
- Node layout radius is `Math.max(26, entities.length * 1.9)` here, so nodes clear the building; with a
  tiny topology two nodes land on the vertical axis (directly above/below the roof) — that is the
  fibonacci-sphere layout, not an overlap bug.

## Devin Secrets Needed

None. `FEC_API_KEY`/`OTX_API_KEY` are optional; without them those pipelines report `skipped`
(expected). `API_KEY`/`GRAFANA_PASSWORD` are generated locally for the test run.
