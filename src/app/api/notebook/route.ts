import { installNotebook } from "../../../../server/notebook";

export async function GET() {
  return Response.json(installNotebook());
}
