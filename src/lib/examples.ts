import type { Platform, RequestTypeChoice } from "@/lib/optimize/types";

export interface PromptExample {
  id: string;
  title: string;
  type: Exclude<RequestTypeChoice, "auto">;
  blurb: string;
  prompt: string;
}

export const EXAMPLES: PromptExample[] = [
  {
    id: "launch-email",
    title: "Launch email",
    type: "creative",
    blurb: "Vague marketing copy request",
    prompt:
      "Write a product launch email for our new headphones. Make it good and exciting.",
  },
  {
    id: "api-review",
    title: "API review",
    type: "technical",
    blurb: "Underspecified engineering ask",
    prompt:
      "Review this REST API and tell me if it's good. We have users, orders, and payments. Need auth.",
  },
  {
    id: "transformers",
    title: "Explain transformers",
    type: "educational",
    blurb: "Teaching request with no audience",
    prompt: "Explain how transformers work in AI. Keep it simple but not dumbed down.",
  },
  {
    id: "monolith",
    title: "Migration plan",
    type: "complex",
    blurb: "Multi-step systems problem",
    prompt:
      "Help me migrate our monolith to microservices. We have a 8-year-old Rails app, 40 engineers, and customers who cannot have downtime.",
  },
];

export const PLATFORM_LABELS: Record<Platform, string> = {
  chatgpt: "ChatGPT / GPT-4",
  claude: "Claude",
  gemini: "Gemini",
  universal: "Any model",
};
