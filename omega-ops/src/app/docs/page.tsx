import { Card } from "@/components/ui";

const ROUTES: [string, string, string, string][] = [
  ["GET", "/api/health", "open", "Process memory, database reachability, safeguard configuration"],
  ["POST", "/api/auth/login", "open", "Exchange the operator passphrase for an 8-hour signed session"],
  ["POST", "/api/auth/logout", "session", "End the session"],
  ["GET", "/api/auth/me", "open", "Current principal and role"],
  ["GET", "/api/batches", "open", "Last 50 batches with narratives"],
  ["POST", "/api/batches", "operator", "Run one batch now (rejected if one is running or the minimum interval has not elapsed)"],
  ["GET", "/api/batches/:id", "open", "One batch with its stage telemetry and anomalies"],
  ["GET", "/api/cron/batch", "scheduler", "Scheduler entry point; bearer scheduler secret"],
  ["GET", "/api/anomalies?q=&limit=", "open", "Register search"],
  ["GET", "/api/anomalies/:id", "open", "One anomaly with its 50-metric block"],
  ["GET", "/api/incidents?state=", "open", "Incident desk"],
  ["PATCH", "/api/incidents/:id", "operator", "Change state, priority, assignee or note"],
  ["GET/POST", "/api/assets", "open / operator", "Authorized asset inventory"],
  ["GET", "/api/groups", "open", "Asset groups with matched anomalies and open incidents"],
  ["GET", "/api/groups/:group", "open", "One asset group: its assets and every matched anomaly with its M01–M50 block"],
  ["GET", "/api/telemetry", "open", "DAG, per-stage aggregates, batch series, runtime"],
  ["GET", "/api/treasury", "open", "Simulated balance, ledger and daily spend"],
  ["PUT", "/api/limits", "admin", "Set batch_max or daily_max"],
  ["GET", "/api/audit?limit=", "open", "Audit entries plus full-chain verification"],
  ["GET/POST/DELETE", "/api/keys", "admin", "List, mint or revoke API keys (bearer tokens with viewer or operator role)"],
];

export default function Docs() {
  return (
    <div className="space-y-4">
      <h1 className="font-mono text-lg font-bold">API</h1>
      <Card title="Authentication">
        <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
          <li>Browser: operator passphrase → HMAC-signed, httpOnly, SameSite=Strict session cookie (admin role).</li>
          <li>Automation: <code className="font-mono text-fg">Authorization: Bearer &lt;api key&gt;</code>. Keys are stored only as SHA-256 digests and can be revoked.</li>
          <li>Scheduler: bearer scheduler secret, operator role, used only by the batch route.</li>
          <li>Roles rank viewer &lt; operator &lt; admin. Every write is appended to the audit chain with actor, role and client address.</li>
        </ul>
      </Card>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] font-mono text-xs">
          <thead className="bg-panel text-left text-dim">
            <tr>{["method", "path", "access", "purpose"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROUTES.map(([m, p, a, d]) => (
              <tr key={m + p}>
                <td className="px-3 py-1.5 text-accent">{m}</td>
                <td className="px-3 py-1.5">{p}</td>
                <td className="px-3 py-1.5 text-dim">{a}</td>
                <td className="px-3 py-1.5">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card title="Data sources">
        <ul className="list-disc space-y-1 pl-5 text-sm text-dim">
          <li>Exploited-vulnerability catalog — cisa.gov JSON feed, read whole each batch.</li>
          <li>CVE API 2.0 — nvd.nist.gov, records modified in the change window plus direct lookups for candidates missing severity.</li>
          <li>EPSS v1 — api.first.org, 30-day exploitation probability and percentile.</li>
          <li>Platform — stage timing, bytes read, heap and resident memory measured during the batch.</li>
        </ul>
      </Card>
    </div>
  );
}
