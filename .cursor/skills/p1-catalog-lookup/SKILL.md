---
name: p1-catalog-lookup
description: Look up P1 catalog slots and their skill/agent/resource mappings. Use GET /v1/p1 with q, limit, offset. Expect 1000+ slots.
---

# p1-catalog-lookup

YAML source: `.cursor/skills/p1-catalog-lookup/skill.yaml`.

Use GET /v1/p1 with q, limit, offset. Expect 1000+ slots.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
