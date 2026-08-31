import { readState, summarize, store, applyCors } from "../lib/store.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  res.setHeader("cache-control", "no-store");

  try {
    const state = await readState();
    res.status(200).json({
      status: "operational",
      timestamp: new Date().toISOString(),
      store,
      apiKeyConfigured: Boolean(process.env.API_KEY),
      region: process.env.VERCEL_REGION || null,
      services: {
        treasury: "https://api.usaspending.gov",
        otx: process.env.OTX_API_KEY ? "https://otx.alienvault.com/api/v1" : "disabled (no OTX_API_KEY)",
      },
      summary: summarize(state),
    });
  } catch (err) {
    res.status(503).json({ status: "degraded", error: err.message });
  }
}
