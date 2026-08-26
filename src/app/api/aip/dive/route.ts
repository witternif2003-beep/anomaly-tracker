import { runAipDeepDive } from "@/lib/aip-sigma0/dive";

export async function GET() {
  return Response.json(await runAipDeepDive());
}
