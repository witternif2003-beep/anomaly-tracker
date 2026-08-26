---
name: p1-courtlistener
description: Query public CourtListener opinions through the local legal search proxy. Use when the user wants real case names, courts, and dates. No API key required.
---

# p1-courtlistener

YAML source: `.cursor/skills/p1-courtlistener/skill.yaml`.

Use when the user wants real case names, courts, and dates. No API key required.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
