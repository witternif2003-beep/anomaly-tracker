"use client";
import { Bars, Card, ErrorBox, RowsTable } from "@/components/ui";
import { useApi } from "@/lib/client";
import { useAgentAddress } from "../use-agent";

type R = Record<string, unknown>[];

export default function Memory() {
  const address = useAgentAddress();
  const { data, error } = useApi<{ eventTypeTotals: R; memoryCounts: R; events: R; knowledge: R; workingMemory: R; episodic: R; sessionSummaries: R }>(`/api/agents/${address}/memory`);
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Rows per memory tier" source="COUNT(*) per state.db memory table">
          <Bars data={data?.memoryCounts ?? []} label="table" value="rows" />
        </Card>
        <Card title="Event stream by type (tokens)" source="state.db event_stream GROUP BY type">
          <Bars data={data?.eventTypeTotals ?? []} label="type" value="tokens" />
        </Card>
      </div>
      <Card title="Event stream (latest 50)" source="state.db event_stream; compacted_to set when compressed">
        <RowsTable rows={data?.events} columns={["created_at", "type", "goal_id", "task_id", "token_count", "compacted_to", "content"]} />
      </Card>
      <Card title="Knowledge store" source="state.db knowledge_store">
        <RowsTable rows={data?.knowledge} columns={["category", "key", "confidence", "access_count", "token_count", "source", "last_verified", "content"]} />
      </Card>
      <Card title="Working memory" source="state.db working_memory">
        <RowsTable rows={data?.workingMemory} columns={["created_at", "content_type", "priority", "token_count", "expires_at", "content"]} />
      </Card>
      <Card title="Episodic memory" source="state.db episodic_memory">
        <RowsTable rows={data?.episodic} columns={["created_at", "event_type", "importance", "outcome", "classification", "summary"]} />
      </Card>
      <Card title="Session summaries" source="state.db session_summaries">
        <RowsTable rows={data?.sessionSummaries} columns={["created_at", "turn_count", "total_tokens", "total_cost_cents", "summary"]} />
      </Card>
    </div>
  );
}
