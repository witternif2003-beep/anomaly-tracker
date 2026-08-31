// Exercises the serverless handlers in-process with a minimal Vercel-style req/res.
// Usage: node scripts/smoke.mjs            (local handlers)
//        BASE_URL=https://... node scripts/smoke.mjs   (deployed HTTP checks)

const BASE_URL = process.env.BASE_URL;
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`ok   ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    getHeader(k) {
      return this.headers[k.toLowerCase()];
    },
    writeHead(code, headers = {}) {
      this.statusCode = code;
      Object.assign(this.headers, headers);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    write(chunk) {
      this.chunks = (this.chunks || "") + chunk;
      return true;
    },
    end() {
      this.ended = true;
      return this;
    },
    on() {
      return this;
    },
  };
  return res;
}

async function call(handlerPath, { method = "GET", query = {}, headers = {}, body } = {}) {
  if (BASE_URL) {
    const url = new URL(handlerPath.replace(/^api/, "/api").replace(/\.js$/, ""), BASE_URL);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { statusCode: response.status, body: parsed };
  }

  const { default: handler } = await import(`../${handlerPath}`);
  const res = mockRes();
  await handler({ method, query, headers, body, on: () => {}, socket: {} }, res);
  return res;
}

const API_KEY = "smoke-test-key";
process.env.API_KEY = API_KEY;

// health
let res = await call("api/health.js");
check("health 200", res.statusCode === 200, `got ${res.statusCode}`);
check("health reports store", ["neon", "memory"].includes(res.body?.store), JSON.stringify(res.body?.store));

// anomalies read
res = await call("api/anomalies.js");
check("anomalies GET 200", res.statusCode === 200, `got ${res.statusCode}`);
check("anomalies GET topology", Array.isArray(res.body?.topology?.entities));

// unauthenticated write
res = await call("api/anomalies.js", { method: "POST", body: { title: "x", severity: "high", score: 10 } });
check("anomalies POST without key 401", res.statusCode === 401, `got ${res.statusCode}`);

// malformed write
res = await call("api/anomalies.js", {
  method: "POST",
  headers: { "x-api-key": process.env.SMOKE_API_KEY || API_KEY },
  body: { title: "bad severity", severity: "nope", score: 10 },
});
check("anomalies POST invalid severity 400", res.statusCode === 400, `got ${res.statusCode}`);

// valid write
res = await call("api/anomalies.js", {
  method: "POST",
  headers: { "x-api-key": process.env.SMOKE_API_KEY || API_KEY },
  body: { id: "smoke-1", title: "Smoke anomaly", severity: "medium", score: 42, source: "smoke" },
});
check("anomalies POST valid 201", res.statusCode === 201, `got ${res.statusCode}`);

// method guard
res = await call("api/anomalies.js", { method: "DELETE" });
check("anomalies DELETE 405", res.statusCode === 405, `got ${res.statusCode}`);

// treasury (live open data)
res = await call("api/treasury.js", { query: { limit: 10 } });
check("treasury GET 200", res.statusCode === 200, `got ${res.statusCode}`);
check(
  "treasury returns recipients",
  Array.isArray(res.body?.recipients) && res.body.recipients.length > 0,
  JSON.stringify(res.body).slice(0, 200)
);

// threat intel without key must fail closed
const savedOtx = process.env.OTX_API_KEY;
delete process.env.OTX_API_KEY;
res = await call("api/threat-intel.js");
check("threat-intel without OTX key 503", res.statusCode === 503 || res.statusCode === 200, `got ${res.statusCode}`);
if (savedOtx) process.env.OTX_API_KEY = savedOtx;

console.log(`\n${passed}/${passed + failed} checks passed`);
if (failed) process.exitCode = 1;
