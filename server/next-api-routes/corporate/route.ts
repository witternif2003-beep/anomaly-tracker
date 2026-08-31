// Not mounted under src/app/api: see the note in ../anomaly/route.ts.
import { compileCorporateTaxonomy } from "../../corporate-taxonomy";

export async function GET() {
  return Response.json(compileCorporateTaxonomy());
}
