---
name: testing-lyra-console
description: How to build, serve, and end-to-end test the Lyra / anomaly-tracker Next.js console locally (routes, static JSON data path, basePath checks, credentials/scout-healer panel).
---

# Testing the Lyra anomaly-tracker console

## Run it
```bash
source ~/.nvm/nvm.sh && nvm use 22.14.0   # package.json pins node 22.14.0
npm install                                # postinstall relinks tsc
npm run build                              # prebuild bakes public/static/*.json via scripts/generate-static-site-data.ts
npm start                                  # next start --hostname 0.0.0.0 --port 43127
```
`npm run dev` also serves on 43127. No credentials/logins are needed for any page.

Routes: `/`, `/tracker`, `/aip`, `/corporate`, `/inventory`.

**Route/trailing-slash behaviour depends on the branch — check `next.config.ts` before asserting:**
- With `trailingSlash: true`: use trailing slashes (`/api/x` 308-redirects to `/api/x/`).
- Once `trailingSlash` is removed (as on the Vercel server-build line), it is the reverse:
  `/tracker/` 308-redirects to `/tracker`. Use `curl -sL` so API checks follow redirects either way.

Rebake the static payload without a full rebuild:
```bash
npx --no-install tsx scripts/generate-static-site-data.ts   # writes public/static/*.json
bash scripts/check-env-placeholders.sh                       # invariant guard, see below
```

## Where the data comes from
- `src/lib/static-data.ts` `fetchJsonWithStaticFallback` prefers prebuilt `public/static/*.json`.
  Older branches gate this on `NEXT_PUBLIC_STATIC_SITE=1`; newer ones instead pass
  `preferStatic: true` at the call site (tracker + inventory). Either way the tracker hydrates from
  `/static/anomaly.json`, so **rebake after changing anything under `server/`** or the UI will show
  stale counts and you will chase a phantom bug.
- `/tracker`, `/inventory` mount with **no** `initialData`, so all their content comes from a
  client-side fetch of `/static/anomaly.json` / `/static/notebook.json`. If those 404, the pages show
  "Could not reach the anomaly tracker." — this makes them a good canary for basePath/asset-prefix bugs.
- `/corporate` is build-time compiled (server component reads `data/**` during `next build`).
- `/aip` shows its data source in the header chip: `dive=api` when Next API routes are mounted,
  `dive=in-browser` when they are not. Handy one-glance check of whether the API layer is live.

## Known pre-existing noise (do not report as regressions)
- On branches where the `/api/*` handlers still live in `server/next-api-routes/` they are NOT mounted
  by Next, so `POST /api/optimize`, `GET /api/aip/dive`, `POST /api/aip/scan` all 404. Studio and the
  AIP console degrade gracefully to in-browser paths. Once the handlers are restored under
  `src/app/api`, `/api/aip`, `/api/notebook`, `/api/suggest`, `/api/optimize` return 200 JSON —
  but `/api/anomaly` and `/api/corporate` are still unmounted and 404 (never implemented in Next).
- `POST /api/optimize` requires an `input` field, NOT `prompt`. Posting `{"prompt":...}` returns a
  **400** `{"error":"Field `input` is required."}` — that is correct validation, not a broken route.
- Grepping page HTML for `/anomaly-tracker` yields a **false positive** on `/inventory`: the page
  renders the literal filenames `server/anomaly-tracker.ts` and `install-p1-inventory.sh` as content.
  Grep for URL attributes instead: `grep -oE '(src|href)="/anomaly-tracker'`.
- DevTools Issues panel reports 2x a11y "No label associated with a form field" on `/`.
- `/tracker/` polls `/static/anomaly.json` continuously (scout-healer), producing thousands of
  network rows. Use the Network filter box and "Preserve log" rather than eyeballing the list.

## Checking for basePath / asset-prefix regressions
Fastest check is the DevTools Network filter: type `anomaly-tracker` and confirm it reads
`0 / N requests`. In the shell, check URL attributes (see the false-positive note above):
```bash
for r in / /tracker /aip /corporate /inventory; do
  printf "%-12s %s\n" "$r" "$(curl -s http://localhost:43127$r | grep -oE '(src|href)="/anomaly-tracker' | wc -l)"
done   # every route must print 0
```
Also confirm the rendered nav hrefs are plain `/`, `/tracker`, `/corporate`, `/inventory`, `/aip`.

## Credentials / env-placeholder panel (`/tracker` card "5. Credentials & security")
- Classification lives in `server/load-env.ts`; counts are compiled in `server/anomaly-tracker.ts`;
  the summary/badges render in `src/components/lyra/anomaly-tracker.tsx`.
- `operatorSecret: true` vars (the Cloudflare deploy pair) render `=operator` and are excluded from
  `configuredCount`, so the summary reads `16/16 app placeholders configured (16 free) · 2 operator-held`.
  Non-operator vars render `=free` / `=set` / `=empty`.
- `scripts/check-env-placeholders.sh` is the invariant guard: it fails if a baked badge carries a
  `value`/`token`/`secret` field, or if a live env value appears verbatim in the bake. Run it after
  every rebake — it is much faster than eyeballing the JSON.
- Testing the leak detector requires **tampering the baked payload, not the source**, e.g. inject
  `"value": "..."` onto a `credentials.variables[]` entry in `public/static/anomaly.json`, hard-reload,
  and expect `P1 · Credential value present in the app payload`. Restore with
  `git checkout -- public/static && npx --no-install tsx scripts/generate-static-site-data.ts`.
  Note the bake embeds timestamps, so `git status` shows `public/static/*.json` modified after any
  rebake even when nothing meaningful changed — diff with `generatedAt`/`at` stripped before worrying.

## Scout / healer panel (`src/components/lyra/scout-bot.tsx`)
- The status badge is computed from **healable** findings only
  (`setStatus(remaining.length ? ... : "healthy")` where `remaining` filters `f.healable`). A
  non-healable finding (e.g. the credential-disclosure P1) therefore leaves the badge reading
  `healthy` even though the red P1 card is listed and the `Open` tile is non-zero. Assert on the
  `Open` tile and the finding card, not the status badge.
- On boot the log always contains a `Tracker book missing → healed` row before hydration finishes;
  that is normal, not a failure.

## GUI gotchas
- `/tracker/` is an extremely long page with nested scroll containers; mouse-wheel scroll over the
  3D canvas or inner lists scrolls those, not the page. Scroll near the right edge of the content
  column (x ≈ 650 with DevTools docked right) to move the page.
- The 3D chamber sometimes paints black/torn immediately after navigation; wait ~8s or hard-reload
  (Ctrl+Shift+R) before screenshotting.
- Close DevTools before capturing the "hero" screenshot — the docked panel halves the viewport and
  clips the chamber labels.
- The dashboard nav pills are at the very top of the page but `Ctrl+Home` does not always reach them
  on `/tracker` (nested scroll containers). Follow it with a large mouse-wheel scroll up.
- Best way to navigate this very long page is Chrome's find bar (`Ctrl+F`) with the card heading
  (e.g. `5. Credentials`, `Scout heal log`) then `Escape` — it scrolls the right container for you,
  and the match counter (`0/0`, `2/2`) doubles as a cheap DOM assertion for strings like `=empty`.

## Devin Secrets Needed
None for local testing. (`CLOUDFLARE_R2_ACCESS_KEY_ID` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` exist in
the session for R2 deploys only and are not needed to run or test the app.)
