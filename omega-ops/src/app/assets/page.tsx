import { AssetForm } from "@/components/asset-form";
import { Card, ErrorBox, RowsTable } from "@/components/ui";
import { db } from "@/lib/db";
import { safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function Assets() {
  const { data, error } = await safe(async () => {
    const sql = await db();
    return sql`
      SELECT a.id, a.name, a.class, a.vendor, a.product, a.criticality, a.owner,
        (SELECT count(*) FROM ops_finding f WHERE lower(COALESCE(f.product,'')) = lower(COALESCE(a.product,'~')) OR lower(COALESCE(f.vendor,'')) = lower(COALESCE(a.vendor,'~'))) AS matched_anomalies
      FROM ops_asset a ORDER BY a.id DESC LIMIT 200`;
  });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-mono text-lg font-bold">AUTHORIZED ASSETS</h1>
        <p className="text-sm text-dim">Systems your organisation owns or is authorized to defend. Each asset is matched against the register by vendor and product so incidents can be scoped to it.</p>
      </div>
      <ErrorBox error={error} />
      <Card title="Register an asset (operator)"><AssetForm /></Card>
      {data && <Card title="Inventory"><RowsTable rows={Array.from(data) as Record<string, unknown>[]} empty="No assets registered yet." /></Card>}
    </div>
  );
}
