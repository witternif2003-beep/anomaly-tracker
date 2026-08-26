---
name: p1-develop
description: Develop techniques, role, and structure for a P1 work product. Use when choosing how to frame an issue memo, motion outline, or local-v1 prompt.
---

# p1-develop

YAML source: `.cursor/skills/p1-develop/skill.yaml`.

Use when choosing how to frame an issue memo, motion outline, or local-v1 prompt.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
