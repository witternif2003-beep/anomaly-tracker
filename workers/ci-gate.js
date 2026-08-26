/**
 * Lyra CI gate — Cloudflare Worker (dry-run only).
 * Edge gateway that checks P1 catalog health before CI is allowed to pass.
 */
const P1_ORIGIN = "http://127.0.0.1:4040";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.P1_ORIGIN || P1_ORIGIN;

    if (url.pathname === "/health") {
      return json({ ok: true, worker: "lyra-ci-gate" });
    }

    if (url.pathname === "/gate" || url.pathname === "/") {
      try {
        const res = await fetch(`${origin}/v1/p1?limit=1`);
        if (!res.ok) {
          return json({ ok: false, reason: `p1 http ${res.status}` }, 503);
        }
        const body = await res.json();
        const slots = Number(body.totalSlots || 0);
        const row = (body.data && body.data[0]) || {};
        const mapped = Boolean(row.skillId && row.agentId && row.resource);
        const pass = slots >= 11000 && mapped;
        return json(
          {
            ok: pass,
            worker: "lyra-ci-gate",
            totalSlots: slots,
            skillId: row.skillId || null,
            agentId: row.agentId || null,
            resource: row.resource || null,
          },
          pass ? 200 : 503,
        );
      } catch (error) {
        return json({ ok: false, reason: String(error) }, 503);
      }
    }

    return json({ error: "not found" }, 404);
  },
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
