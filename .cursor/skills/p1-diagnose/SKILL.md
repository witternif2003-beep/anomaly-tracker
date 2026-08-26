---
name: p1-diagnose
description: Diagnose gaps, ambiguity, and specificity in a P1 request. Use when the user has a draft but it is vague, overbroad, or missing the standard of review.
---

# p1-diagnose

YAML source: `.cursor/skills/p1-diagnose/skill.yaml`.

Use when the user has a draft but it is vague, overbroad, or missing the standard of review.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
