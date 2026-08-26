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
| `/v1/legal/search` | POST | FOLIO cards + public CourtListener + P1 | None |
| `/v1/p1` | GET | 1,280 P1 catalog slots (`q`, `limit`, `offset`) | None |
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
| Cloudflare Code Mode | Infrastructure | `@cloudflare/mcp` | `mcp-remote` → `https://mcp.cloudflare.com/mcp` plus `@cloudflare/mcp-server-cloudflare` | OAuth / API token |
| Playwright | Browser automation | `@playwright/mcp` | `@playwright/mcp@0.0.79` | None (local) |
| Firecrawl | Web scraping | `firecrawl-mcp` | `firecrawl-mcp@3.24.0` | API key |
| Postgres MCP Pro | Database | `@postgres/mcp-pro` | PyPI `postgres-mcp==0.3.0` (Crystal DBA) plus npm `mcp-postgres` | `DATABASE_URI` |
| Sentry | Error monitoring | `@sentry/mcp` | `@sentry/mcp-server@0.37.0` | Auth token / device OAuth |
| Kubernetes | Cluster ops | `@kubernetes/mcp` | `mcp-server-kubernetes@4.1.4` | Kubeconfig |
| Slack | Messaging | `@slack/mcp` | `@chinchillaenterprises/mcp-slack@4.14.0` (official Slack MCP unpublished; Anthropic package deprecated) | Bot token |
| Context7 | Live docs | `context7-mcp` | `@upstash/context7-mcp@4.0.3` | API key |
| FOLIO | Legal ontology | `folio-mcp@0.4.1` | Installed | None (CC-BY cards locally; document pulls need `folio login`) |
