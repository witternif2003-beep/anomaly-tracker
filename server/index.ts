import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { legalSearch, legalSearchStatus } from "./legal-search";
import { envPlaceholderStatus, loadEnvFiles } from "./load-env";
import { cjisStatus, policyStatus, refuseCjisQuery } from "./policy";
import {
  chunkText,
  completeChat,
  listModels,
  resolveModel,
  type ChatMessage,
} from "./local-models";
import { inventoryStatus } from "./inventory";
import { oneShotStatus } from "./install-status";
import { listP1Slots } from "./p1-catalog";
import { ghostHandStatus } from "../src/lib/optimize/ghost-hand";
import { aipSigma0Status } from "../src/lib/aip-sigma0/protocol";
import { scanText } from "../src/lib/aip-sigma0/scanner";
import { runAipDeepDive } from "../src/lib/aip-sigma0/dive";

loadEnvFiles();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.LOCAL_API_HOST ?? "0.0.0.0";
const PORT = Number(process.env.LOCAL_API_PORT ?? 4040);

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  void req.headers.authorization;
  next();
});

app.get("/favicon.svg", (_req, res) => {
  res.type("image/svg+xml");
  res.sendFile(path.join(__dirname, "favicon.svg"));
});

app.get("/favicon.ico", (_req, res) => {
  res.redirect(301, "/favicon.svg");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, server: "lyra-local-api", port: PORT });
});

app.get("/v1/models", (_req, res) => {
  res.json(listModels());
});

app.get("/v1/p1", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const limitRaw = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
  const offsetRaw = req.query.offset !== undefined ? Number(req.query.offset) : 0;
  res.json(
    listP1Slots({
      q,
      limit: Number.isFinite(limitRaw) && (limitRaw as number) > 0 ? limitRaw : undefined,
      offset: Number.isFinite(offsetRaw) && (offsetRaw as number) > 0 ? offsetRaw : 0,
    }),
  );
});

app.get("/v1/inventory", (_req, res) => {
  res.json(inventoryStatus());
});

app.get("/v1/install", (_req, res) => {
  res.json(oneShotStatus());
});

app.get("/v1/mode", (_req, res) => {
  res.json({ object: "lyra.mode", defaultMode: "detail", ...ghostHandStatus() });
});

app.get("/v1/aip", (_req, res) => {
  res.json(aipSigma0Status());
});

app.get("/v1/aip/dive", async (_req, res) => {
  res.json(await runAipDeepDive());
});

app.post("/v1/aip/scan", (req, res) => {
  const body = (req.body ?? {}) as { text?: unknown; anchors?: unknown; receipts?: unknown };
  const text = String(body.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const anchors = Array.isArray(body.anchors) ? body.anchors.map(String) : [];
  if (Array.isArray(body.receipts)) {
    for (const row of body.receipts) {
      if (typeof row === "string") anchors.push(row);
      else if (row && typeof row === "object" && "text" in row) anchors.push(String((row as { text: unknown }).text));
    }
  }
  res.json({ object: "aip.scan", ...scanText(text, anchors) });
});

app.post("/v1/legal/search", async (req, res) => {
  const body = (req.body ?? {}) as { query?: unknown; q?: unknown; sources?: unknown; limit?: unknown };
  const query = String(body.query ?? body.q ?? "").trim();
  const sources = Array.isArray(body.sources) ? body.sources.map(String) : undefined;
  const limit = typeof body.limit === "number" ? body.limit : undefined;
  const result = await legalSearch({ query, sources, limit });
  res.json(result);
});

app.get("/v1/legal/sources", (_req, res) => {
  res.json({ object: "legal.sources", sources: legalSearchStatus() });
});

app.get("/v1/env", (_req, res) => {
  res.json(envPlaceholderStatus());
});

app.get("/v1/policy", (_req, res) => {
  res.json(policyStatus());
});

app.get("/v1/compliance/cjis", (_req, res) => {
  res.json(cjisStatus());
});

app.post("/v1/cjis/search", (_req, res) => {
  res.status(403).json(refuseCjisQuery());
});

function asMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as { role?: unknown; content?: unknown };
    const role = row.role;
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") return null;
    const content =
      typeof row.content === "string"
        ? row.content
        : Array.isArray(row.content)
          ? row.content
              .map((part) =>
                typeof part === "string"
                  ? part
                  : part && typeof part === "object" && "text" in part
                    ? String((part as { text: unknown }).text)
                    : "",
              )
              .join("\n")
          : "";
    messages.push({ role, content });
  }
  return messages;
}

app.post("/v1/chat/completions", async (req, res) => {
  const body = (req.body ?? {}) as {
    model?: string;
    messages?: unknown;
    stream?: boolean;
    temperature?: number;
  };
  const messages = asMessages(body.messages);
  if (!messages) {
    res.status(400).json({
      error: {
        message: "messages is required (OpenAI chat format)",
        type: "invalid_request_error",
      },
    });
    return;
  }

  const model = resolveModel(body.model);
  const completion = await completeChat(messages, model);
  const usage = {
    prompt_tokens: completion.promptTokens,
    completion_tokens: completion.completionTokens,
    total_tokens: completion.promptTokens + completion.completionTokens,
  };

  if (!body.stream) {
    res.json({
      id: completion.id,
      object: "chat.completion",
      created: completion.created,
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: completion.content },
          finish_reason: "stop",
        },
      ],
      usage,
    });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({
    id: completion.id,
    object: "chat.completion.chunk",
    created: completion.created,
    model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  });

  for (const delta of chunkText(completion.content)) {
    send({
      id: completion.id,
      object: "chat.completion.chunk",
      created: completion.created,
      model,
      choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
    });
  }

  send({
    id: completion.id,
    object: "chat.completion.chunk",
    created: completion.created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage,
  });
  res.write("data: [DONE]\n\n");
  res.end();
});

app.get("/v1/playground", (_req, res) => {
  res.sendFile(path.join(__dirname, "playground.html"));
});

app.get("/", (_req, res) => {
  res.redirect("/v1/playground");
});

app.listen(PORT, HOST, () => {
  console.log(`Lyra local API http://127.0.0.1:${PORT} (bound ${HOST}:${PORT})`);
  console.log(`Playground     http://127.0.0.1:${PORT}/v1/playground`);
});
