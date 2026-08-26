import { scanText } from "@/lib/aip-sigma0/scanner";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const payload = body as { text?: unknown; anchors?: unknown; receipts?: unknown };
  const text = String(payload.text ?? "").trim();
  if (!text) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  const anchors = Array.isArray(payload.anchors) ? payload.anchors.map(String) : [];
  if (Array.isArray(payload.receipts)) {
    for (const row of payload.receipts) {
      if (typeof row === "string") anchors.push(row);
      else if (row && typeof row === "object" && "text" in row) {
        anchors.push(String((row as { text: unknown }).text));
      }
    }
  }
  return Response.json({ object: "aip.scan", ...scanText(text, anchors) });
}
