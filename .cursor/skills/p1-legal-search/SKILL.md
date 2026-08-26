---
name: p1-legal-search
description: Run FOLIO / CourtListener / P1 legal search from the local API. Use when the user asks for authorities, cases, or ontology cards. POST /v1/legal/search.
---

# p1-legal-search

YAML source: `.cursor/skills/p1-legal-search/skill.yaml`.

Use when the user asks for authorities, cases, or ontology cards. POST /v1/legal/search.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
