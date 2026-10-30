import { describe, expect, it, vi } from "vitest";
import { chatJson, DeepSeekError, parseJsonObject, backoffMs, isRetryableStatus } from "../deepseek";
import { buildMessages, clampScore, codenameOf, telemetryFor } from "../engine";
import { signToken, verifyToken } from "../auth";

const ok = (content: string, status = 200) =>
  new Response(
    JSON.stringify({
      model: "deepseek-flash",
      system_fingerprint: "fp_x",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6 },
      choices: [{ message: { content }, finish_reason: "stop" }],
    }),
    { status },
  );

describe("deepseek client", () => {
  it("parses only JSON objects", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonObject("   ")).toBeNull();
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject("nope")).toBeNull();
  });

  it("classifies statuses and caps backoff", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(402)).toBe(false);
    expect([0, 1, 2, 3, 10].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("retries 429 and blank JSON-mode content, then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("rate", { status: 429 }))
      .mockResolvedValueOnce(ok("   "))
      .mockResolvedValueOnce(ok('{"codename":"X","anomaly_score":3}'));
    const sleep = vi.fn(async () => {});
    const r = await chatJson([{ role: "user", content: "json" }], { fetchImpl, sleep, apiKey: "k" });
    expect(r.attempts).toBe(3);
    expect(r.parsed.codename).toBe("X");
    expect(sleep).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("does not retry auth errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad key", { status: 401 }));
    await expect(chatJson([], { fetchImpl, sleep: async () => {}, apiKey: "k" })).rejects.toBeInstanceOf(DeepSeekError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after max retries", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNRESET"));
    const err = await chatJson([], { fetchImpl, sleep: async () => {}, apiKey: "k" }).catch((e: DeepSeekError) => e);
    expect(err).toBeInstanceOf(DeepSeekError);
    expect((err as DeepSeekError).attempts).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("engine helpers", () => {
  it("clamps scores to NUMERIC(5,2)", () => {
    expect(clampScore(12.345)).toBe(12.35);
    expect(clampScore("7")).toBe(7);
    expect(clampScore(1e9)).toBe(999.99);
    expect(clampScore("x")).toBeNull();
    expect(clampScore(undefined)).toBeNull();
  });

  it("derives codename", () => {
    expect(codenameOf({ codename: "  A " })).toBe("A");
    expect(codenameOf({ title: "T" })).toBe("T");
    expect(codenameOf({})).toBe("UNLABELLED");
  });

  it("builds a JSON-mode prompt that mentions json and prior codenames", () => {
    const m = buildMessages({ id: "1", prompt_text: "P", instruction: "" }, 3, ["A", "B"]);
    expect(m[0].content.toLowerCase()).toContain("json");
    expect(m[1].content).toContain("Batch number: 3");
    expect(m[1].content).toContain("A, B");
  });

  it("records only measured telemetry", () => {
    const t = Object.fromEntries(
      telemetryFor(
        {
          parsed: { anomaly_score: 5, a: 1 },
          content: '{"anomaly_score":5,"a":1}',
          usage: { prompt_tokens: 10, total_tokens: 15 },
          finishReason: "stop",
          model: "deepseek-flash",
          systemFingerprint: null,
          httpStatus: 200,
          attempts: 1,
          latencyMs: 321,
        },
        null,
      ),
    );
    expect(t.M01_latency_ms).toBe("321");
    expect(t.M04_prompt_tokens).toBe("10");
    expect(t.M05_completion_tokens).toBeUndefined();
    expect(t.M16_system_fingerprint).toBeUndefined();
    const e = Object.fromEntries(telemetryFor(null, new DeepSeekError("boom", 503, 4, 900)));
    expect(e).toMatchObject({ M02_attempts: "4", M03_http_status: "503", M12_json_valid: "false", M17_error: "boom" });
  });
});

describe("session tokens", () => {
  const secret = "s".repeat(40);
  it("round-trips and rejects tampering/expiry", () => {
    const t = signToken({ actor: "op" }, 60, secret);
    expect(verifyToken<{ actor: string }>(t, secret)?.actor).toBe("op");
    expect(verifyToken(t.replace(/^./, "x"), secret)).toBeNull();
    expect(verifyToken(signToken({ actor: "op" }, -1, secret), secret)).toBeNull();
  });
});
