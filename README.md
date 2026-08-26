# Lyra

Lyra is a prompt optimization studio. Paste a rough ask, pick Basic or Detail mode, and get a paste-ready prompt built with the **4-D method**: Deconstruct, Diagnose, Develop, Deliver.

It does not call ChatGPT, Claude, or Gemini. The optimizer runs locally in this app. You copy the result into the model of your choice.

## What you get

- **Basic mode** — immediate rewrite using core techniques (role, constraints, output contract).
- **Detail mode** — two or three clarifying questions when the brief is missing audience, format, or constraints; skip to use labeled defaults.
- **Request types** — auto-detect, or lock Creative, Technical, Educational, or Complex.
- **Platform formatting** — markdown sections for ChatGPT, XML-style tags for Claude, numbered comparative structure for Gemini.
- **4-D trace** — see intent, gaps, techniques, and what changed.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43127](http://localhost:43127).

```bash
npm run build
npm start
```

No API keys. No database.

## Local application server (127.0.0.1:4040)

Express 5.2.1 serves an OpenAI-compatible local API. Models `local-v1` and `local-v1-concise` run on-box. Authorization headers are accepted and ignored.

```bash
npm run local-api
```

| Endpoint | Method | Function | Auth |
| --- | --- | --- | --- |
| `/v1/chat/completions` | POST | OpenAI-compatible chat (optional `stream`) | Bearer ignored |
| `/v1/models` | GET | Lists `local-v1` and `local-v1-concise` | None |
| `/v1/legal/search` | POST | FOLIO, FRE, CourtListener, P1; OpenLaws/Westlaw/Lexis when keys are set | None |
| `/v1/legal/sources` | GET | Install/credential status for legal research clients | None |
| `/v1/policy` | GET | GitHub-removed / YOLO-off / dry-run / CJIS applicability | None |
| `/v1/compliance/cjis` | GET | CJIS/NCIC placeholder status (never values) | None |
| `/v1/p1` | GET | 11,280 P1 slots (`q`, `limit`, `offset`) — 1,280 core + 10,000 Tier-1 | None |
| `/v1/inventory` | GET | Requested packages vs closest installs | None |
| `/v1/playground` | GET | Streaming chat UI | None |

```bash
curl http://127.0.0.1:4040/v1/models
curl -H 'Authorization: Bearer ignored' -H 'Content-Type: application/json' \
  -d '{"model":"local-v1","messages":[{"role":"user","content":"Rewrite this prompt for a motion to dismiss."}]}' \
  http://127.0.0.1:4040/v1/chat/completions
```

Open [http://127.0.0.1:4040/v1/playground](http://127.0.0.1:4040/v1/playground).

## How the engine chooses techniques

| Type | Emphasis |
| --- | --- |
| Creative | Multi-perspective angles, tone lock, anti-cliché constraints |
| Technical | Constraint-based reasoning, failure modes, precision |
| Educational | Few-shot shape, progressive disclosure, misconception handling |
| Complex | Staged analysis, decision framework, kill criteria |

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui.

## Toolchain (pinned)

Run `bash scripts/install-toolchain.sh` (or `npm run toolchain`) to install this exact runtime. `npm ci` alone installs the lockfile packages; the script also pins Node via nvm, global CLIs, and Playwright Chromium.

| Package | Version | Install | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Node.js | 22.14.0 | `nvm install 22.14.0` | JavaScript runtime | `.nvmrc` |
| npm | 10.9.7 | `npm install -g npm@10.9.7` | Package manager | Bundled with Node, then pinned |
| Next.js | 16.3.2 | lockfile | React framework | Exact pin |
| React / react-dom | 19.2.8 | lockfile | UI library | Exact pin |
| lucide-react | 1.34.0 | lockfile | Icons | Exact pin |
| @types/node | 22.20.1 | lockfile | TypeScript types | Exact pin |
| TypeScript | 7.0.2 | lockfile (`typescript`) | `tsc` / Next typecheck | Next uses `experimental.useTypeScriptCli` |
| TypeScript API | 6.0.2 | `@typescript/typescript6` | ESLint parser API | Closest substitute — TS 7 has no compiler API yet |
| ESLint | 10.9.0 | lockfile | Linting | Active |
| @eslint/js | 10.0.1 | lockfile | ESLint recommended config | Closest substitute — `@eslint/js@10.9.0` is not on npm |
| typescript-eslint | 8.68.0 | lockfile | TypeScript lint rules | Used instead of `eslint-config-next` (not ESLint 10 compatible) |
| Playwright | 1.62.1 | lockfile | Browser automation | `npx playwright install chromium` |
| folio-mcp | 0.4.1 | `npm i -g folio-mcp@0.4.1` | Legal ontology MCP | stdio server; document pulls need `folio login` |
| Wrangler | 4.x | `npm i -g wrangler@4` | Cloudflare Workers CLI | Dry-run / version check only — never deploy |
| tsx | 4.23.12 | lockfile | Run the Express TypeScript server | Active |
| Express | 5.2.1 | lockfile | Local application server on :4040 | Active |
| cors | 2.8.6 | lockfile | CORS for the local API / playground | Active |

```bash
nvm install 22.14.0
npm install -g npm@10.9.7
npm ci
npx playwright install chromium
npm install -g folio-mcp@0.4.1
npm install -g wrangler@4
```

`npm run verify` checks these versions, `tsc --noEmit`, and ESLint.

## MCP servers (configured, not authenticated)

`.cursor/mcp.json` lists stdio/OAuth MCP servers. Remote ones need OAuth or API keys injected as environment secrets — nothing is stored in git. Reinstall with `bash scripts/install-mcp.sh`.

| Server | Purpose | Requested package | Installed | Credentials |
| --- | --- | --- | --- | --- |
| Amplitude | Analytics | `@amplitude/mcp` | `amplitude-mcp@0.0.2` (closest; requested name not on npm) | API + secret key |
| AWS CloudWatch | Infra / logs | `@aws/mcp` | `@teolin/mcp-cloudwatch-logs@3.3.9` (`mcp-aws` is a stub) | IAM keys |
| Figma | Design tokens | `@figma/mcp` | `figma-developer-mcp@0.13.2` | API key (OAuth is Figma's hosted MCP) |
| Linear | Project management | `@linear/mcp` | `mcp-remote` → `https://mcp.linear.app/sse` plus `@tacticlaunch/mcp-linear` | OAuth |
| Stripe | Payments | `@stripe/mcp` | `@stripe/mcp@0.3.3` | Restricted secret key |
| Cloudflare | Infrastructure | `@cloudflare/mcp` | `@cloudflare/mcp-server-cloudflare@0.2.0` (token + account id) plus `mcp-remote` Code Mode | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Playwright | Browser automation | `@playwright/mcp` | `@playwright/mcp@0.0.79` | None (local) |
| Firecrawl | Web scraping | `firecrawl-mcp` | `firecrawl-mcp@3.24.0` | API key |
| Postgres MCP Pro | Database | `@postgres/mcp-pro` | PyPI `postgres-mcp==0.3.0` (Crystal DBA) plus npm `mcp-postgres` | `DATABASE_URI` |
| Sentry | Error monitoring | `@sentry/mcp` | `@sentry/mcp-server@0.37.0` | Auth token / device OAuth |
| Kubernetes | Cluster ops | `@kubernetes/mcp` | `mcp-server-kubernetes@4.1.4` | Kubeconfig |
| Slack | Messaging | `@slack/mcp` | `@chinchillaenterprises/mcp-slack@4.14.0` (official Slack MCP unpublished; Anthropic package deprecated) | Bot token |
| Context7 | Live docs | `context7-mcp` | `@upstash/context7-mcp@4.0.3` | API key |
| FOLIO | Legal ontology | `folio-mcp@0.4.1` | Installed | None (CC-BY cards locally; document pulls need `folio login`) |

## Skills, agents, and pipelines

Local P1 files. No extra packages.

| Type | Count | Location |
| --- | --- | --- |
| Skills | 16 | `.cursor/skills/*/skill.yaml` (Cursor-readable `SKILL.md` alongside) |
| Agents | 10 | `.cursor/agents/*.md` |
| Pipelines | 8 | `scripts/pipelines/` |
| Cloudflare Worker | 1 | `workers/ci-gate.js` |
| Catalog slots | 11,280 | `GET /v1/p1` — 1,280 core + 10,000 Tier-1 inventory slots |

```bash
npm run pipelines
```

Named pipelines: `cloudflare-ci.sh` (Wrangler **dry-run only**), `cloudflare-p1-health.sh`, `env-placeholders.sh`, `no-github-actions.sh`, `policy-guard.sh`.

## Policy replacements

| Requested | Status | Closest match installed |
| --- | --- | --- |
| GitHub Actions | Removed | Cloudflare scripts (`scripts/pipelines/cloudflare-ci.sh`, `npm run cf:dry-run`) |
| GitHub MCP | Removed | Cloudflare MCP (`cloudflare` + `cloudflare-code-mode`) |
| Black's Law Dictionary | Workaround | Public-domain glossary + FOLIO (`source=glossary`) |
| Cursor YOLO / Auto-Run | Disabled | Empty allowlists in `.cursor/permissions.json`; `cursor.agent.autoRun: false` |
| Background Agents | Activated | `.cursor/environment.json` install/start + ports 43127/4040 (Cloud Agents) |
| Marketplace plugins | Integrated | Cline, Roo Code, Continue (Open VSX) + Continue/Cline/Roo config files |
| Live Cloudflare deploy | Dry-run only | `scripts/wrangler-safe.sh` refuses deploy without `--dry-run` |
| CJIS / NCIC / federal credentials | Applicable placeholders | `CJIS_*` / `NCIC_*` empty in git; live queries return 403 |

`GET /v1/policy` reports this table. `POST /v1/cjis/search` is always refused.

## Environment variables (placeholders)

No values are stored in git. Copy `.env.example` to `.env.local` or inject Cloud Agent secrets. `GET /v1/env` reports which names are configured without printing values.

| Variable | Used by | Closest package / alias | Status in git |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare MCP, Wrangler | `@cloudflare/mcp-server-cloudflare` | empty |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare MCP, Wrangler | same | empty |
| `DATABASE_URI` | Postgres MCP Pro | `DATABASE_URL` (`mcp-postgres` / libpq) | empty |
| `FIRECRAWL_API_KEY` | Firecrawl MCP | `FIRECRAWL_OAUTH_TOKEN` for OAuth | empty |
| `CONTEXT7_API_KEY` | Context7 MCP | `@upstash/context7-mcp` | empty |
| `OPENLAWS_API_KEY` | OpenLaws legal search | REST client (`pip openlaws` is unpublished) | empty |
| `WESTLAW_USERNAME` | Westlaw | `WESTLAW_CLIENT_ID` / `WESTLAW_API_KEY` | empty |
| `WESTLAW_PASSWORD` | Westlaw | `WESTLAW_CLIENT_SECRET` | empty |
| `LEXISNEXIS_API_KEY` | LexisNexis | REST stub; `LEXISNEXIS_CLIENT_ID` | empty |
| `CJIS_ORI` | CJIS applicability | Placeholder only; not a certified interface | empty |
| `CJIS_AGENCY_ID` | CJIS applicability | `FBI_UCR_AGENCY_ID` | empty |
| `NCIC_ORI` | NCIC applicability | Same ORI family; live queries refused | empty |
| `NCIC_MNEMONIC` | NCIC applicability | Placeholder only | empty |
| `FBI_UCR_AGENCY_ID` | Federal UCR / NIBRS id | Public Crime Data Explorer, not NCIC | empty |
| `PACER_USERNAME` | PACER REST stub | `pacer-tools` failed to build; `pacer-client` is unrelated | empty |
| `PACER_PASSWORD` | PACER REST stub | session never opened from this studio | empty |
| `FINRA_API_KEY` | FINRA TRACE | REST `api.finra.org` | empty |
| `USPTO_API_KEY` | USPTO patents | `developer.uspto.gov` REST | empty |

```bash
npm run env:check
```

## P1 Tier-1 expanded inventory (10,000 additional slots)

Requested scoped packages (`@law-research/opinion-parser`, `crimemapping`, Docker Hub names, etc.) are mostly unpublished. Closest public npm/PyPI packages are installed; Docker images are replaced by in-process libraries because this VM has no Docker. Cuckoo is not installed (live malware sandbox); `pefile` is the static substitute.

```bash
npm run inventory:install
```

`GET /v1/inventory` lists requested vs closest. Core catalog remains `p1-0001`…`p1-1280`. Tier-1 slots are `p1-t1-00001`…`p1-t1-10000`.

| Requested | Closest installed / wired |
| --- | --- |
| `@law-research/opinion-parser` | `pdf-parse`, `citation-js`, `compromise` |
| `@forensic-tools/disk-imaging` | `hachoir` + `pefile` (no public npm imager) |
| `@crime-analytics/geospatial` | `@turf/turf`, `geojson`, `geolib` |
| `@financial-intel/sanctions-screen` | npm `ofac` |
| `@osint-collector/social-media` | `sherlock-project` + clone `vendor/p1/sherlock` |
| `@evidence-chain/hash-verifier` | `hash-wasm`, `ssri`, `hasha`, `object-hash` |
| `crimemapping` | `folium` |
| `forensic-accounting` | `pyod` |
| `legal-ner` | `eyecite` + `reporters-db` |
| `db-forensics` | `sqlite-utils` |
| `steganography-tools` | `stegano` + Pillow (`steganography-tools` fails to build) |
| `elastic/elasticsearch:8.12` | `minisearch` (no Docker/Podman in this VM) |
| `neo4j/neo4j:5.0` / Maltego CE | `graphology` (Maltego is a proprietary installer) |
| `osint-framework/alpine` | `recon-ng` clone |
| `sherlock/sherlock` | `sherlock-project/sherlock` clone |
| `the-harvester/email-gatherer` | `laramies/theHarvester` clone |
| `Project-AUTOMATE` | `cyb3rfox/Aurora-Incident-Response` |
| `FOCA` | `ElevenPaths/FOCA` + `exifread` |
| `Recon-ng` | `lanmaster53/recon-ng` |
| `Cuckoo` | **not installed** (live malware sandbox). Closest: `pefile` static PE metadata |
| SEC EDGAR | `edgartools` + public EFTS REST |
| FINRA TRACE | REST `api.finra.org` |
| OFAC SDN | public `treasury.gov` CSV |
| USPTO patents | `developer.uspto.gov` REST |
| PACER / `pacer-client` | REST stub; PyPI `pacer-client` is unrelated |

## Editor extensions

Recommended for VS Code / Cursor. This cloud VM has no `code` CLI, so they were installed from Open VSX into `~/.cursor/extensions` and `~/.vscode/extensions`. Locally, run `bash scripts/install-extensions.sh` or `code --install-extension <id>`.

| Extension | ID | Purpose | Installed |
| --- | --- | --- | --- |
| Cline | `saoudrizwan.claude-dev` | AI-assisted coding | 4.1.15 |
| Roo Code | `RooVeterinaryInc.roo-cline` | AI agent | 3.54.0 |
| Continue | `Continue.continue` | AI code completion | 2.1.0 (linux-x64) |
