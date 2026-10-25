import { db, hasDb } from "@/lib/db";
import { computeProfit } from "@/lib/profit";
import { SURVIVAL_TIERS } from "@/lib/survival";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Prometheus text exposition from agent-signed snapshots. */
export async function GET() {
  const lines: string[] = [];
  const g = (name: string, help: string) => lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
  g("omega_up", "Control plane is serving");
  lines.push("omega_up 1");
  if (hasDb()) {
    const sql = await db();
    const agents = await sql`
      SELECT a.address, COALESCE(a.name,'') AS name, a.last_snapshot_at, s.credits_cents, s.turn_count, s.survival_tier
      FROM agents a LEFT JOIN snapshots s ON s.id = a.last_snapshot_id`;
    g("omega_agents_registered", "Registered automatons");
    lines.push(`omega_agents_registered ${agents.length}`);
    g("omega_agent_credits_cents", "Conway credits (cents) from latest signed snapshot");
    g("omega_agent_turns_total", "Turn count from latest signed snapshot");
    g("omega_agent_snapshot_age_seconds", "Seconds since latest signed snapshot was captured");
    g("omega_agent_survival_tier", "1 for the agent's current survival tier");
    for (const a of agents) {
      const l = `address="${esc(a.address)}",name="${esc(a.name)}"`;
      if (a.credits_cents != null) lines.push(`omega_agent_credits_cents{${l}} ${a.credits_cents}`);
      if (a.turn_count != null) lines.push(`omega_agent_turns_total{${l}} ${a.turn_count}`);
      if (a.last_snapshot_at) lines.push(`omega_agent_snapshot_age_seconds{${l}} ${Math.round((Date.now() - new Date(a.last_snapshot_at).getTime()) / 1000)}`);
      for (const t of SURVIVAL_TIERS) if (a.survival_tier) lines.push(`omega_agent_survival_tier{${l},tier="${t}"} ${a.survival_tier === t ? 1 : 0}`);
    }
    const profit = await Promise.all(
      agents.map(async (a) => ({ a, p: a.last_snapshot_at ? await computeProfit(sql, { address: a.address }) : null })),
    );
    const metric = (name: string, help: string, pick: (p: NonNullable<(typeof profit)[number]["p"]>) => number | null | undefined) => {
      g(name, help);
      for (const { a, p } of profit) {
        const v = p ? pick(p) : null;
        if (v != null && Number.isFinite(v)) lines.push(`${name}{address="${esc(a.address)}",name="${esc(a.name)}"} ${v}`);
      }
    };
    metric("omega_agent_net_cents", "Realised net P&L (cents, all time) from the latest signed snapshot", (p) => p.latest?.netCents);
    metric("omega_agent_revenue_cents", "Realised revenue (cents, all time): transactions transfer_in", (p) => p.latest?.revenueCents);
    metric("omega_agent_cost_cents", "Realised cost (cents, all time): max(ledger costs, inference_costs)", (p) => p.latest?.costCents);
    metric("omega_agent_net_cents_per_hour", "Net P&L change per hour over the trailing ~24 h of snapshots", (p) => p.window?.netCentsPerHour as number | null);
    metric("omega_agent_burn_cents_per_hour", "Cost growth per hour over the trailing ~24 h of snapshots", (p) => p.window?.burnCentsPerHour as number | null);
    metric("omega_agent_credit_runway_hours", "Credits divided by burn per hour", (p) => p.window?.runwayHours as number | null);
    metric("omega_agent_track_record_days", "Days in the daily net P&L series", (p) => p.validation.n);
    metric("omega_agent_psr", "Probabilistic Sharpe ratio of daily net P&L (SR*=0, capped 0.95; absent when N<30)", (p) => p.validation.psr);
    metric("omega_agent_edge_gates_passed", "1 when every edge gate (data floor, PSR, DSR, PBO, MinTRL, haircut) passes", (p) => (p.validation.gateStatus === "PASS" ? 1 : 0));
    const [{ n }] = await sql<{ n: string }[]>`SELECT count(*) AS n FROM audit_log`;
    g("omega_audit_records", "Audit chain length");
    lines.push(`omega_audit_records ${n}`);
  }
  return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; version=0.0.4", "Cache-Control": "no-store" } });
}
