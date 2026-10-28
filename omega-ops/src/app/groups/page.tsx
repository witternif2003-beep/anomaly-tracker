import Link from "next/link";
import { AutoRefresh } from "@/components/refresh";
import { Empty, ErrorBox } from "@/components/ui";
import { groupSummaries } from "@/lib/groups";
import { num, safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function Groups() {
  const { data, error } = await safe(groupSummaries);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-bold">ASSET GROUPS</h1>
          <p className="text-sm text-dim">One section per organisation that registers the systems it runs or is authorized to defend. Every batch matches new anomalies against each group&apos;s assets by vendor and product; matches appear here as they are discovered.</p>
        </div>
        <AutoRefresh seconds={30} />
      </div>
      <ErrorBox error={error} />
      {data && !data.length && <Empty>No asset groups yet. Register an asset with an asset group on the Assets page.</Empty>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {data?.map((g) => (
          <li key={g.name} className="rounded-lg border border-line bg-panel p-3 font-mono text-xs">
            <Link href={`/groups/${encodeURIComponent(g.name)}`} className="text-sm font-bold text-accent hover:underline">{g.name}</Link>
            <p className="mt-1 text-dim">
              {num(g.assets)} assets · {num(g.anomalies)} matched anomalies · {num(g.open_incidents)} open incidents · newest anomaly {g.newest_anomaly ?? "—"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
