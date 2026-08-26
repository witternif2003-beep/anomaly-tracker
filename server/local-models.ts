import { optimize } from "../src/lib/optimize/engine";
import { legalSearch } from "./legal-search";
import { searchP1 } from "./p1-catalog";
import { formatScanFooter, scanText } from "../src/lib/aip-sigma0/scanner";

export const LOCAL_MODELS = [
  {
    id: "local-v1",
    object: "model" as const,
    created: 1_700_000_000,
    owned_by: "lyra-local",
    description: "Local full-answer model. No external LLM keys.",
  },
  {
    id: "local-v1-concise",
    object: "model" as const,
    created: 1_700_000_000,
    owned_by: "lyra-local",
    description: "Local short-answer model. No external LLM keys.",
  },
] as const;

export type LocalModelId = (typeof LOCAL_MODELS)[number]["id"];

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export function resolveModel(id?: string): LocalModelId {
  if (id === "local-v1-concise") return "local-v1-concise";
  return "local-v1";
}

export function listModels() {
  return { object: "list" as const, data: LOCAL_MODELS.map((m) => ({ ...m })) };
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user" && messages[i].content.trim()) {
      return messages[i].content.trim();
    }
  }
  return "";
}

function looksLikePromptCraft(text: string): boolean {
  return /\b(prompt|rewrite|system prompt|optimize|4-d|lyra)\b/i.test(text);
}

function looksLegal(text: string): boolean {
  return /\b(case|court|holding|statute|opinion|plaintiff|defendant|motion|§|u\.s\.c|qualified immunity|habeas|injunction|class action|copyright|patent|sec |rule 12|rule 56)\b/i.test(
    text,
  );
}

async function buildAnswer(messages: ChatMessage[], model: LocalModelId): Promise<string> {
  const user = lastUserText(messages);
  if (!user) {
    return "Send a user message. This local server does not call an external model.";
  }

  const concise = model === "local-v1-concise";
  const sections: string[] = [];
  const anchors: string[] = [user];
  const academic =
    /\b(postdoc|post-doctoral|dissertation|identification strategy|research question|peer review|falsif|replicat)\b/i.test(
      user,
    );

  if (looksLikePromptCraft(user) || academic) {
    try {
      const result = optimize({
        input: user,
        mode: concise ? "basic" : academic ? "postdoc" : "detail",
        requestType: "auto",
        platform: "universal",
        skipQuestions: true,
      });
      if (result.status === "complete" && result.optimizedPrompt) {
        if (concise) {
          sections.push(result.optimizedPrompt.slice(0, 900));
        } else {
          sections.push("## Optimized prompt", result.optimizedPrompt);
          sections.push("## What changed", result.whatChanged.map((w) => `- ${w}`).join("\n"));
          if (result.ghostHand.active) {
            sections.push(
              "## GHOST-HAND",
              result.ghostHand.hand.map((layer) => `- ${layer.name}: ${layer.rule}`).join("\n"),
            );
            const lat = result.ghostHand.lattice;
            if (lat?.engaged) {
              sections.push(
                "## Lyra-2 lattice",
                `${lat.lockedCount}/${lat.axisCount} axes locked · ${lat.tensionCount} tensions`,
                ...lat.tensions.map((t) => `- ${t.left} ↔ ${t.right}: ${t.note}`),
              );
            }
          }
        }
      }
    } catch {
      sections.push("Could not run the local prompt optimizer on that input; answering without a rewrite.");
    }
  }

  if (looksLegal(user) || /folio|courtlistener|p1/i.test(user)) {
    const found = await legalSearch({ query: user, limit: concise ? 3 : 6 });
    if (found.results.length) {
      sections.push(concise ? "## Authorities" : "## FOLIO / CourtListener / P1");
      for (const hit of found.results.slice(0, concise ? 3 : 6)) {
        const cite = hit.citation ? ` (${hit.citation})` : "";
        const court = hit.court ? ` — ${hit.court}` : "";
        sections.push(`- **${hit.source.toUpperCase()}** ${hit.title}${court}${cite}: ${hit.snippet.slice(0, concise ? 160 : 280)}`);
        if (hit.url && !concise) sections.push(`  ${hit.url}`);
      }
      if (found.warnings.length) {
        sections.push(`_Search notes: ${found.warnings.join("; ")}_`);
      }
      for (const hit of found.results) {
        anchors.push(hit.title, hit.snippet, hit.citation ?? "", hit.url ?? "", hit.court ?? "");
      }
    }
    const slots = searchP1(user, concise ? 2 : 4);
    if (slots.length && !concise) {
      sections.push("## Related P1 slots", slots.map((s) => `- \`${s.id}\` ${s.title}`).join("\n"));
    }
  }

  if (sections.length === 0) {
    if (concise) {
      sections.push(
        `**local-v1-concise:** ${user.slice(0, 180)}\n\nAnswer in three moves: (1) restate the ask, (2) give a direct response, (3) name the missing fact that would change the answer. No external LLM was called.`,
      );
    } else {
      sections.push(
        [
          `**local-v1** (on-box, no API keys)`,
          "",
          `You asked: ${user}`,
          "",
          "Working answer:",
          "1. Restate the goal in one sentence.",
          "2. List constraints that were stated or should be assumed.",
          "3. Produce a concrete draft or plan.",
          "4. Flag what a larger hosted model would still need to verify.",
          "",
          "This completion is generated by the local Express server using the Lyra optimizer, the P1 catalog, and public legal search when the ask looks legal. Switch to `local-v1-concise` for a shorter reply.",
        ].join("\n"),
      );
    }
  }

  const system = messages.find((m) => m.role === "system")?.content.trim();
  if (system && !concise) {
    sections.unshift(`_System instruction honored locally:_ ${system.slice(0, 240)}`);
  }

  const text = sections.join("\n\n").trim();
  const scan = scanText(text, anchors);
  const withAip = `${text}\n\n---\n${formatScanFooter(scan)}`;
  if (concise && withAip.length > 1400) return `${withAip.slice(0, 1390).trim()}…`;
  return withAip;
}

export async function completeChat(messages: ChatMessage[], model: LocalModelId): Promise<{
  id: string;
  created: number;
  content: string;
  promptTokens: number;
  completionTokens: number;
}> {
  const content = await buildAnswer(messages, model);
  const promptTokens = Math.max(
    1,
    Math.round(messages.reduce((n, m) => n + m.content.length, 0) / 4),
  );
  const completionTokens = Math.max(1, Math.round(content.length / 4));
  return {
    id: `chatcmpl-local-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    content,
    promptTokens,
    completionTokens,
  };
}

export function chunkText(text: string, size = 24): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [""];
}
