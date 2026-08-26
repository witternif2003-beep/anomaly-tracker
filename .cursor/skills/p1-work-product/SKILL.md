---
name: p1-work-product
description: Pick the right P1 work product (memo, outline, digest, checklist). Use when the user has a topic but not a deliverable type.
---

# p1-work-product

YAML source: `.cursor/skills/p1-work-product/skill.yaml`.

Use when the user has a topic but not a deliverable type.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
