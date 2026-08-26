---
name: p1-deconstruct
description: Deconstruct a P1 brief into intent, actors, constraints, and missing facts. Use when a legal or prompt brief is messy and needs the 4-D Deconstruct pass before drafting.
---

# p1-deconstruct

YAML source: `.cursor/skills/p1-deconstruct/skill.yaml`.

Use when a legal or prompt brief is messy and needs the 4-D Deconstruct pass before drafting.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
