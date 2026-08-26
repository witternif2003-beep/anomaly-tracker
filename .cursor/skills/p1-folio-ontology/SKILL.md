---
name: p1-folio-ontology
description: Map a question onto FOLIO ontology cards (elements, burdens, review). Use for doctrine cards without scraping the web. Prefer local FOLIO hits.
---

# p1-folio-ontology

YAML source: `.cursor/skills/p1-folio-ontology/skill.yaml`.

Use for doctrine cards without scraping the web. Prefer local FOLIO hits.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
