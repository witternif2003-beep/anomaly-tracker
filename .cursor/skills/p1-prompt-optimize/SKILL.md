---
name: p1-prompt-optimize
description: Optimize a rough ask with Lyra's local 4-D engine. Use for prompt rewrites. Calls the same engine as POST /api/optimize and local-v1.
---

# p1-prompt-optimize

YAML source: `.cursor/skills/p1-prompt-optimize/skill.yaml`.

Use for prompt rewrites. Calls the same engine as POST /api/optimize and local-v1.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
