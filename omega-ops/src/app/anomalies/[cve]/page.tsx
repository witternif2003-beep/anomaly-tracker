import { notFound } from "next/navigation";
import { AnomalyRecord } from "@/components/anomaly-record";
import { ErrorBox } from "@/components/ui";
import { anomalyDetail } from "@/lib/detail";
import { HttpError } from "@/lib/env";
import { safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function AnomalyPage({ params }: PageProps<"/anomalies/[cve]">) {
  const { cve } = await params;
  if (!/^(CVE-\d{4}-\d{4,}|\d+)$/i.test(cve)) notFound();
  const { data, error } = await safe(async () => {
    try {
      return await anomalyDetail(cve);
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  });
  if (!error && !data) notFound();
  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {data && <AnomalyRecord f={data.anomaly} metrics={data.metrics} incident={data.incident} />}
    </div>
  );
}
