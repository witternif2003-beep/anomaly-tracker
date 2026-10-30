# SYNAPSE-NODE

Operator-controlled prompt processing on the DeepSeek API, with batches streamed to a dashboard over Server-Sent Events.

Batch contents are **DeepSeek model output and are not verified**; the dashboard labels them that way. Telemetry (latency, attempts, HTTP status, tokens, cache hits, JSON validity, output size, model, fingerprint) is measured from the API calls. Without `DEEPSEEK_API_KEY` the engine stays offline and shows that state. It never writes placeholder batches.

## Two runtimes, one schema

| | Vercel (deployed) | Self-hosted (`docker compose up`) |
| --- | --- | --- |
| API | Next.js route handlers (`src/app/api`) | FastAPI (`backend/main.py`) |
| Worker | Runs inside the SSE route while a viewer is connected, plus a daily Vercel Cron (`/api/cron/tick`); a Postgres lease row stops concurrent runs | Celery worker (`backend/worker.py`) that re-queues itself while the prompt is `ACTIVE` |
| Queue | none (Postgres lease) | Redis |
| DB | Postgres / Neon | Postgres 15 |

Both use the tables `synapse_master_prompts`, `synapse_output_batches`, `synapse_system_telemetry` and `synapse_engine_lease` (`src/lib/schema-sql.ts`, mirrored in `backend/schema.sql`), so the dashboard can read batches written by either one.

## Auth

- Reading (dashboard, `GET` routes, SSE) is public.
- Creating prompts, start/pause/complete and manual batches need an operator session. Sign in with `OPERATOR_PASSPHRASE`; the session is an HMAC-signed HttpOnly cookie keyed by `SESSION_SECRET`.
- `/api/cron/tick` needs `Authorization: Bearer $CRON_SECRET`. Vercel Cron sends this automatically.
- FastAPI mutations need `Authorization: Bearer $OPERATOR_TOKEN`.

## API (Next.js)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/health` | public |
| POST | `/api/initiate-protocol` `{prompt, instruction?}` | operator |
| GET | `/api/prompts` | public |
| PATCH | `/api/prompts/:id` `{status: ACTIVE\|PAUSED\|COMPLETED}` | operator |
| GET | `/api/batches?prompt=<uuid>&after=<seq>&limit=` | public |
| GET | `/api/stream-batches/:promptId` (SSE, `Last-Event-ID` / `?after=`) | public |
| POST | `/api/tick` | operator |
| GET | `/api/cron/tick` | cron secret |
| GET | `/api/telemetry` | public |
| POST | `/api/auth/login`, `/api/auth/logout`; GET `/api/auth/me` | — |

## DeepSeek call

`POST {DEEPSEEK_BASE_URL}/chat/completions` with `response_format: {type: "json_object"}` and `thinking: {type: DEEPSEEK_THINKING}` ([JSON mode](https://api-docs.deepseek.com/guides/json_mode), [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode)). The system prompt includes the word "json" and an example object, which JSON mode requires. HTTP 429/5xx, network errors, timeouts and blank or non-object content are retried with exponential backoff (1 s, 2 s, 4 s, up to `DEEPSEEK_MAX_RETRIES`). Other 4xx errors (401 bad key, 402 no balance, 400/422) fail right away and are stored as an `ERROR` batch.

## Run

```bash
cp .env.example .env.local     # fill DATABASE_URL, OPERATOR_PASSPHRASE, SESSION_SECRET, DEEPSEEK_API_KEY
npm install
npm run dev                    # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
```

Self-hosted stack (Postgres, Redis, FastAPI on :8000, Celery, dashboard on :3000):

```bash
cp .env.example .env           # set POSTGRES_PASSWORD, OPERATOR_TOKEN, OPERATOR_PASSPHRASE, SESSION_SECRET, DEEPSEEK_API_KEY
docker compose up --build
```

## Limits

- `DAILY_BATCH_CAP` (default 500 per rolling 24 h) and `BATCH_INTERVAL_SEC` (default 60) cap spending.
- Vercel Hobby only runs daily crons. Continuous processing on Vercel happens while a dashboard tab is open; for 24/7 processing use the self-hosted stack.
