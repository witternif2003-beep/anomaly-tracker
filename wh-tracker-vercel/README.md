# WH Anomaly Tracker — Vercel variant

Serverless subset of [`../wh-tracker`](../wh-tracker) that runs on Vercel: the 3D topology
viewer (with the wireframe White House), the anomaly API, USAspending and OTX enrichment,
and a server-sent-events stream in place of the websocket.

Live: https://wh-tracker.vercel.app

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
| `/api/reference-topology` | GET | EOP sub-agencies + top award recipients built live from USAspending, every node carrying its upstream URL and flagged `reference: true`; used when the store is empty |
| `/api/sse/stream` | GET | snapshot + change-driven updates, ends before the function limit with a `reconnect` event |

Writes require `X-API-Key`; without a configured `API_KEY` they fail closed with 503.
Reads are unauthenticated so the viewer needs no login.

The viewer prefers SSE and falls back to polling `/api/topology` every 10s when `EventSource`
is unavailable or the stream fails to deliver a snapshot twice in a row (buffering proxies
never forward `text/event-stream`, so the stream would otherwise sit on "connecting…"). The
status dot shows which transport is in use: green `live` (SSE), blue `polling`, red offline.

## Scout bot and error queue

`public/scout.js` is a client-side scout bot: it captures uncaught exceptions, rejected
promises and non-ok/failed requests in the running viewer, and probes `/api/health`,
`/api/topology` and `/api/reference-topology` every 60s. Findings are deduplicated (with a
hit count) into an error queue rendered by `public/error-queue.js`, shown as the bottom-right
panel in the viewer and as a standalone widget at `/errors.html` (embeddable in an iframe).
The queue holds only failures observed in that browser session — nothing simulated — and it
lives in `sessionStorage`, so no unauthenticated write endpoint is added.

The 3D scene is built in isolation: if WebGL is unavailable (hardware acceleration off,
blocked GPU) the failure is recorded in the queue and `public/topology-fallback.js` draws the
same graph — severity colours, degree-scaled nodes, White House wireframe, hover tooltips — as
SVG, so the HUD, feed and polling keep working instead of the page freezing on "connecting…"
with zeroed counters. SVG rather than a 2D canvas deliberately: a canvas whose WebGL context
request already failed can also refuse a `2d` context. Append `?render=2d` to force the
fallback on a machine that does have WebGL.

Mobile browsers cap the memory a WebGL context may claim, so the context is requested with
`powerPreference: "low-power"`, no alpha buffer, `devicePixelRatio` pinned to 1 and
multisampling off on touch devices, retrying once without multisampling before falling back;
a context lost after startup also hands over to the SVG renderer instead of freezing the
scene. "Export PNG" in the legend rasterises whatever is on screen — the WebGL frame via
`canvas.toBlob`, or the serialised SVG drawn onto an offscreen canvas.

## No synthetic data

Nothing the viewer or the APIs return is mocked, seeded with invented records, or randomly
generated. The baseline graph is only the upstream feeds themselves (EOP, USAspending, OTX),
each carrying the URL it represents, and every further entity, link and anomaly comes from a
real FEC, USAspending or OTX response. Node tooltips show each node's `source`, and any
non-live payload is flagged (`reference: true`) and labelled in the HUD.

## Reference topology instead of seed data

When the store holds nothing but the three baseline feed nodes, the viewer loads
`/api/reference-topology` and labels the HUD `reference topology · USAspending FY<year>`.
It is built at request time from three USAspending endpoints (agency profile, sub-agency
breakdown, `spending_by_category/recipient`); every entity carries the URL it came from and
the anomalies are the same `mean + σ·stddev` award-concentration outliers `/api/treasury`
computes. Nothing is fabricated and nothing is written to the store, so the empty-state view
stays attributable — no invented intelligence-sharing nodes or incidents.

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

`BASE_URL=https://wh-tracker.vercel.app npm run smoke` runs the same checks over HTTP
against a deployment (set `SMOKE_API_KEY` to the deployment's `API_KEY` for the write checks).

## Deploy

```bash
npx vercel env add API_KEY production     # openssl rand -hex 32
npx vercel deploy --prod
```

The build step copies the pinned `three` module into `public/vendor/`, so the viewer loads it
same-origin instead of from a CDN.
