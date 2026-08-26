import { aipSigma0Status } from "@/lib/aip-sigma0/protocol";

export async function GET() {
  return Response.json(aipSigma0Status());
}
