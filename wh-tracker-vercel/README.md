# WH Anomaly Tracker — Vercel variant

Serverless subset of [`../wh-tracker`](../wh-tracker) that runs on Vercel: the 3D topology
viewer (with the wireframe White House), the anomaly API, USAspending and OTX enrichment,
and a server-sent-events stream in place of the websocket.

Live: https://wh-tracker-vercel.vercel.app

## What does not come along

Vercel runs request-scoped functions only, so the Docker stack's PDF service (Chromium),
Prometheus, Alertmanager, Grafana and the cron scheduler are not part of this variant, and
there is no long-lived websocket. Use `../wh-tracker` (docker compose) for the full system.

## Endpoints

| Route | Methods | Notes |
|---|---|---|
| `/api/health` | GET | status, backing store, whether `API_KEY` is set |
| `/api/anomalies` | GET, POST | GET returns topology + anomalies + summary; POST appends (auth) |
| `/api/treasury` | GET, POST | EOP (toptier `1100`) profile, sub-agencies, top recipients, `mean + σ·stddev` outliers; POST persists them (auth) |
| `/api/threat-intel` | GET, POST | OTX subscribed pulses, or per-indicator enrichment via `?indicators=domain:example.com,ip:8.8.8.8`; POST persists (auth) |
| `/api/topology` | GET | same snapshot as `GET /api/anomalies`, for clients that poll instead of streaming |
| `/api/sse/stream` | GET | snapshot + change-driven updates, ends before the function limit with a `reconnect` event |

Writes require `X-API-Key`; without a configured `API_KEY` they fail closed with 503.
Reads are unauthenticated so the viewer needs no login.

The viewer prefers SSE and falls back to polling `/api/topology` every 10s when `EventSource`
is unavailable or the stream fails to deliver a snapshot twice in a row (buffering proxies
never forward `text/event-stream`, so the stream would otherwise sit on "connecting…"). The
status dot shows which transport is in use: green `live` (SSE), blue `polling`, red offline.

## State

State lives in Neon Postgres when `DATABASE_URL` is set (table `wh_state`, created on first
use). Without it each function instance keeps its own in-memory copy — fine for a demo, but
a write is only visible to the instance that served it, and it is lost when that instance is
recycled. `/api/health` reports which mode is active via `store`.

## Environment

Copy `env.local.example` to `.env.local` for local runs, or set the same keys as Vercel
project environment variables. `ALLOWED_ORIGINS` is a comma-separated CORS allowlist for
cross-site reads (`*` opens the API to any site); same-origin viewer requests don't need it.

## Local development

```bash
npm install
npm run build     # vendors three into public/vendor
npm run lint      # syntax check of every handler
npm run smoke     # exercises handlers in-process (auth, validation, live USAspending)
npm run dev       # vercel dev
```

`BASE_URL=https://wh-tracker-vercel.vercel.app npm run smoke` runs the same checks over HTTP
against a deployment (set `SMOKE_API_KEY` to the deployment's `API_KEY` for the write checks).

## Deploy

```bash
npx vercel env add API_KEY production     # openssl rand -hex 32
npx vercel deploy --prod
```

The build step copies the pinned `three` module into `public/vendor/`, so the viewer loads it
same-origin instead of from a CDN.
