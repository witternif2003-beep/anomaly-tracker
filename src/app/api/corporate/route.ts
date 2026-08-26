import { compileCorporateTaxonomy } from "../../../../server/corporate-taxonomy";

export async function GET() {
  return Response.json(compileCorporateTaxonomy());
}
