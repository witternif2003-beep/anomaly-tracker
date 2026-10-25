"use client";
import { useState } from "react";
import { useMe } from "@/components/auth";
import { Card, Empty, ErrorBox, RowsTable } from "@/components/ui";
import { api, short, useApi } from "@/lib/client";
import { buildCommandMessage } from "@/lib/command-message";
import { connect, walletErrorText } from "@/lib/wallet";
import { TotpCodeInput, useTotpStatus } from "@/components/totp";
import { useAgentAddress } from "../use-agent";

interface Soul {
  content: string | null;
  creatorAddress: string | null;
  history: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  source: string;
}

function Editor({ initial, children }: { initial: string; children: (draft: string, setDraft: (s: string) => void) => React.ReactNode }) {
  const [draft, setDraft] = useState(initial);
  return <>{children(draft, setDraft)}</>;
}

export default function SoulPage() {
  const address = useAgentAddress();
  const { address: me } = useMe();
  const twoFa = useTotpStatus(me);
  const [totp, setTotp] = useState("");
  const { data, error, reload } = useApi<Soul>(`/api/agents/${address}/soul`);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isCreator = !!me && !!data?.creatorAddress && me.toLowerCase() === data.creatorAddress.toLowerCase();

  const submit = async (draft: string) => {
    setErr(null);
    setMsg(null);
    try {
      const w = await connect();
      const message = buildCommandMessage({ agent: address, type: "soul_update", payload: { content: draft }, nonce: crypto.randomUUID(), issuedAt: new Date().toISOString() });
      const signature = await w.sign(message);
      const r = await api<{ commandId: string }>(`/api/agents/${address}/soul`, { method: "PUT", body: JSON.stringify({ message, signature, totp: totp || undefined }) });
      setMsg(`Queued as command #${r.commandId}. The agent applies it via its own updateSoul() on the next omega-sync --apply run.`);
      reload();
    } catch (e) {
      setErr(walletErrorText(e));
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {isCreator && twoFa.enabled && <TotpCodeInput value={totp} onChange={setTotp} what="every SOUL.md update" />}
      <Card title="SOUL.md" right={<span className="text-xs text-dim">creator {short(data?.creatorAddress)}</span>} source={data?.source}>
        {data && data.content == null && <Empty>No SOUL.md in the latest snapshot.</Empty>}
        <Editor key={data?.content ?? ""} initial={data?.content ?? ""}>
          {(draft, setDraft) => (
            <>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          readOnly={!isCreator}
          rows={18}
          className="w-full rounded border border-line bg-bg p-3 font-mono text-xs"
        />
        {isCreator ? (
          <button onClick={() => submit(draft)} disabled={!draft.trim() || draft === data?.content} className="mt-2 rounded bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40">
            Sign & queue update
          </button>
        ) : (
          <p className="mt-2 text-xs text-dim">Read-only. Only the creator wallet in automaton.json can propose changes.</p>
        )}
            </>
          )}
        </Editor>
        {msg && <p className="mt-2 text-xs text-good">{msg}</p>}
        <ErrorBox error={err} />
      </Card>
      <Card title="Update requests" source="control-plane agent_commands type=soul_update">
        <RowsTable rows={data?.updates} columns={["id", "status", "created_by", "created_at", "updated_at", "result"]} empty="No update requests." />
      </Card>
      <Card title="Soul history" source="state.db soul_history">
        <RowsTable rows={data?.history} columns={["version", "change_source", "change_reason", "content_hash", "created_at"]} />
      </Card>
    </div>
  );
}
