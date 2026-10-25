import { Card } from "@/components/ui";

const Code = ({ children }: { children: string }) => <pre className="overflow-x-auto rounded bg-bg p-3 font-mono text-xs">{children}</pre>;

export default function Docs() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Connect an automaton</h1>
      <Card title="1 · Register the agent">
        <p className="text-sm text-dim">Sign in with Ethereum, then add the agent wallet address (from ~/.automaton/automaton.json walletAddress) on the Fleet page.</p>
      </Card>
      <Card title="2 · Run omega-sync on the agent host">
        <p className="mb-2 text-sm text-dim">
          Needs Node ≥ 22.13 (built-in node:sqlite). It opens state.db read-only, signs each snapshot with the agent wallet (EIP-191 over the payload SHA-256) and POSTs it. The private key never leaves the host.
        </p>
        <Code>{`git clone https://github.com/witternif2003-beep/anomaly-tracker
cd anomaly-tracker/omega-control-plane && npm ci
npx tsx agent/omega-sync.mts --url https://<this-host> --interval 60`}</Code>
      </Card>
      <Card title="3 · (optional) let the agent execute creator-signed commands">
        <p className="mb-2 text-sm text-dim">
          With <span className="font-mono">--apply</span> the script pulls commands (topup, soul_update), re-verifies the creator signature locally against automaton.json creatorAddress, executes them with the automaton&apos;s own code
          (<span className="font-mono">conway/topup.js</span>, <span className="font-mono">soul/tools.js</span>) and posts a signed result.
        </p>
        <Code>{`npx tsx agent/omega-sync.mts --url https://<this-host> --interval 60 \\
  --apply --automaton-dist "$(npm root -g)/@conway/automaton/dist"`}</Code>
      </Card>
      <Card title="Endpoints">
        <Code>{`GET  /api/health                     server + database status
GET  /api/metrics                    Prometheus text format
GET  /api/audit                      audit chain + verification
GET  /api/agents                     fleet
GET  /api/agents/:a/status           snapshot + live Base reads
GET  /api/agents/:a/telemetry        server-sent events
POST /api/agents/:a/snapshots        agent-signed snapshot ingest`}</Code>
      </Card>
      <Card title="Not built">
        <p className="text-sm text-dim">
          HSM/KMS custody, Fireblocks/Ledger, CoreWeave confidential compute, Redis, TOTP 2FA and autonomous fund movement are not part of this app. There are no profit projections; Economics shows realised P&amp;L from the agent&apos;s own ledger only.
        </p>
      </Card>
    </div>
  );
}
