"use client";
import { Bars, Card, ErrorBox, RowsTable, Sparkline, Stat } from "@/components/ui";
import { usd, useApi } from "@/lib/client";
import { useAgentAddress } from "../use-agent";

interface Econ {
  method: string;
  sources: string[];
  pnl: Record<string, number | null>;
  transactionsByType: Record<string, unknown>[];
  inferenceByModel: Record<string, unknown>[];
  inferenceByDay: Record<string, unknown>[];
  recentTransactions: Record<string, unknown>[];
  creditHistory: { captured_at: string; credits_cents: string | null }[];
  topups: Record<string, unknown>[];
  snapshotId: string | null;
}

export default function Economics() {
  const address = useAgentAddress();
  const { data, error } = useApi<Econ>(`/api/agents/${address}/economics`);
  const p = data?.pnl;
  const credits = (data?.creditHistory ?? []).filter((r) => r.credits_cents != null).reverse().map((r) => Number(r.credits_cents));
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {p && (
        <Card title="Realised P&L (all time, from the agent's own ledger)" source={data!.method}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Revenue" value={usd(p.revenueCents)} hint="transactions transfer_in" />
            <Stat label="Costs" value={usd(p.costCents)} hint="inference + x402 + transfers out" />
            <Stat label="Net" value={usd(p.netCents)} tone={(p.netCents ?? 0) >= 0 ? "good" : "bad"} />
            <Stat label="Funding received" value={usd(p.fundingCents)} hint="topups / credit purchases (not revenue)" />
            <Stat label="Cost / turn" value={p.costPerTurnCents == null ? "—" : usd(p.costPerTurnCents)} hint={`${p.turns ?? 0} turns`} />
            <Stat label="Inference calls" value={p.inferenceCalls ?? 0} />
            <Stat label="Input tokens" value={(p.inputTokens ?? 0).toLocaleString()} />
            <Stat label="Output tokens" value={(p.outputTokens ?? 0).toLocaleString()} />
          </div>
        </Card>
      )}
      <Card title="Credit balance across snapshots" source="snapshots.credits_cents (each from Conway /v1/credits/balance or kv financial_state at capture time)">
        <Sparkline points={credits} />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Inference cost by model" source="state.db inference_costs GROUP BY model">
          <Bars data={data?.inferenceByModel ?? []} label="model" value="cost_cents" format={usd} />
        </Card>
        <Card title="Inference cost by day" source="state.db inference_costs GROUP BY day (latest 90)">
          <Bars data={data?.inferenceByDay ?? []} label="day" value="cost_cents" format={usd} />
        </Card>
      </div>
      <Card title="Ledger totals by type" source="state.db transactions GROUP BY type">
        <RowsTable rows={data?.transactionsByType} />
      </Card>
      <Card title="Recent transactions" source="state.db transactions (latest 50)">
        <RowsTable rows={data?.recentTransactions} columns={["created_at", "type", "amount_cents", "balance_after_cents", "description"]} />
      </Card>
      <Card title="Topup requests" source="control-plane agent_commands (creator-signed; executed by the agent via x402)">
        <RowsTable rows={data?.topups} columns={["id", "status", "payload", "created_by", "created_at", "result"]} empty="No topup requests yet. Use the Treasury tab." />
      </Card>
    </div>
  );
}
