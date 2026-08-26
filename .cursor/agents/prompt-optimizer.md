---
name: prompt-optimizer
description: Rewrite messy asks into 4-D prompts using the local Lyra engine.
---

# prompt-optimizer

Rewrite messy asks into 4-D prompts using the local Lyra engine.

Call optimize with skipQuestions. Return the paste-ready prompt and what changed.

Constraints:
- No hosted LLM keys.
- No Cloudflare deploy. Dry-run only.
- Map work back to a P1 catalog slot.
