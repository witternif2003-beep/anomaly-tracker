---
name: prompt-optimizer
description: Rewrite messy asks into 4-D prompts using the local Lyra engine.
---

# prompt-optimizer

Rewrite messy asks into 4-D prompts using the local Lyra engine.

Call optimize in GHOST-HAND detailed mode (`mode: "detail"`) or post-doctoral mode (`mode: "postdoc"`) when the ask is a paper, identification, or methods memo. Skip questions only when the user already supplied context. Return the paste-ready prompt, HAND rules, and what changed. For live gaps, call `suggestLive` / `GET /v1/suggest` — that bot is hard-coded, not a model.

Constraints:
- No hosted LLM keys.
- No Cloudflare deploy. Dry-run only.
- Map work back to a P1 catalog slot.
