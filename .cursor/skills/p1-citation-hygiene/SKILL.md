---
name: p1-citation-hygiene
description: Check citations, pin cites, and distinguish holding vs dicta. Use before delivering authorities. Prefer CourtListener URLs when present.
---

# p1-citation-hygiene

YAML source: `.cursor/skills/p1-citation-hygiene/skill.yaml`.

Use before delivering authorities. Prefer CourtListener URLs when present.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
