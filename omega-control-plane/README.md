# Omega control plane for Conway Automaton

Next.js 16 + Postgres dashboard for [Conway-Research/automaton](https://github.com/Conway-Research/automaton) v0.2.x agents.

- **Fleet / Overview** – survival tier, credits, turns, heartbeat, children from agent-signed snapshots; USDC/ETH and ERC-8004 identity + reputation (v2 `getClients`/`getSummary`) read live from Base.
- **Economics** – realised P&L from the agent's own `transactions` and `inference_costs` tables. No projections.
- **Orchestration** – `goals` + `task_graph` as dependency levels; `orchestrator.last_tick`.
- **Memory** – event stream, knowledge store and the memory tiers.
- **Telemetry** – server-sent events, tool calls, policy decisions.
- **Payout** – USDC on Base to the fixed payout wallet `0x4D11f9f5bB127D4c2e971c2e62b93CAF957b7F0d` (`src/lib/payout.ts`) only, never more than the balance above the treasury reserve; sent by the agent wallet.
- **Soul / Treasury** – creator-signed (EIP-191) commands checked against treasury policy; the agent executes them with its own wallet and code. The control plane holds no keys and never moves funds.
- **Audit** – append-only SHA-256 hash chain (Postgres trigger blocks UPDATE/DELETE), verified on every read.
- `/api/metrics` – Prometheus.

## Run

```sh
npm ci
cp .env.example .env.local   # DATABASE_URL, SESSION_SECRET
npm run dev
```

or `POSTGRES_PASSWORD=… SESSION_SECRET=$(openssl rand -hex 32) docker compose up` (add `--profile observability` for Prometheus).

## Connect an agent

On the agent host (Node ≥ 22.13):

```sh
npx tsx agent/omega-sync.mts --url https://<control-plane> --interval 60 \
  [--apply --automaton-dist "$(npm root -g)/@conway/automaton/dist"]
```

`state.db` is opened read-only. `--keep-alive` buys a Conway credit topup (default $5, max $25 per 24 h) from the agent's own USDC whenever credits drop below 50¢; it cannot help once the wallet is empty. `--apply` executes queued commands with the automaton's own `topupCredits()` / `updateSoul()` (payouts: ERC-20 `transfer` to `PAYOUT_WALLET`; the agent needs Base ETH for gas) after re-checking the creator signature locally.

## Test

```sh
npm test && npm run typecheck && npm run lint
OMEGA_URL=http://localhost:3000 CREATOR_KEY=0x… AUTOMATON_DIR=~/.automaton AUTOMATON_DIST=… npx tsx scripts/e2e-local.mts
```

## Not built

HSM/KMS, Fireblocks/Ledger, CoreWeave, Redis, TOTP 2FA, autonomous fund movement, profit guarantees.
