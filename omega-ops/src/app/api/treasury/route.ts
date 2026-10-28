import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { balance, UNIT_LABEL } from "@/lib/treasury";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = await db();
  const ledger = await sql`SELECT * FROM ops_treasury ORDER BY seq DESC LIMIT 100`;
  const daily = await sql`
    SELECT date_trunc('day', at) AS day, sum(units) FILTER (WHERE kind = 'spend') AS spent
    FROM ops_treasury GROUP BY 1 ORDER BY 1 DESC LIMIT 14`;
  return json({ unit: UNIT_LABEL, simulated: true, balance: await balance(sql), ledger, daily });
});
