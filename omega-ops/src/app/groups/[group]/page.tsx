import { notFound } from "next/navigation";
import { AnomalyRecord } from "@/components/anomaly-record";
import { AutoRefresh } from "@/components/refresh";
import { Card, Empty, ErrorBox, RowsTable } from "@/components/ui";
import { HttpError } from "@/lib/env";
import { groupDetail } from "@/lib/groups";
import { safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function Group({ params }: PageProps<"/groups/[group]">) {
  const { group } = await params;
  const name = decodeURIComponent(group);
  const { data, error } = await safe(async () => {
    try {
      return await groupDetail(name);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  });
  if (!error && !data) notFound();
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-bold break-words">ASSET GROUP · {data?.name ?? name}</h1>
          <p className="text-sm text-dim">Anomalies matched to this group&apos;s authorized assets, newest first, each in the full record format with its M01–M50 block. Updated as each batch discovers new anomalies.</p>
        </div>
        <AutoRefresh seconds={30} />
      </div>
      <ErrorBox error={error} />
      {data && (
        <>
          <Card title={`Assets (${data.assets.length})`}>
            <RowsTable rows={data.assets.map(({ id, name, class: cls, vendor, product, criticality, owner }) => ({ id, name, class: cls, vendor, product, criticality, owner }))} />
          </Card>
          <p className="font-mono text-xs text-dim">
            {data.total} matched anomalies{data.total > data.fullRecords ? ` · full records shown for the newest ${data.fullRecords}` : ""}
          </p>
          {!data.records.length && <Empty>No anomaly in the register matches these assets yet.</Empty>}
          {data.records.map((r) => (
            <div key={r.anomaly.cve_id}>
              <p className="mb-1 font-mono text-[11px] text-dim">matched assets: {data.matched.find((m) => m.cve_id === r.anomaly.cve_id)?.matched_assets.join(", ")}</p>
              <AnomalyRecord f={r.anomaly} metrics={r.metrics} incident={r.incident} attribution={r.attribution} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
