---
name: p1-deliver
description: Deliver a paste-ready P1 prompt or work-product outline. Use when the user needs a finished artifact, not more questions.
---

# p1-deliver

YAML source: `.cursor/skills/p1-deliver/skill.yaml`.

Use when the user needs a finished artifact, not more questions.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
