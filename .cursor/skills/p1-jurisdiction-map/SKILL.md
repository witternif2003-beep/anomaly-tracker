---
name: p1-jurisdiction-map
description: Map a problem onto the catalog jurisdiction (circuit or district). Use when venue, circuit split, or binding vs persuasive authority matters.
---

# p1-jurisdiction-map

YAML source: `.cursor/skills/p1-jurisdiction-map/skill.yaml`.

Use when venue, circuit split, or binding vs persuasive authority matters.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
