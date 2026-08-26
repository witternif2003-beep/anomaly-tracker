---
name: p1-issue-memo
description: Shape a P1 issue memo: question presented, brief answer, analysis, caveats. Use for issue-memo work products in the catalog.
---

# p1-issue-memo

YAML source: `.cursor/skills/p1-issue-memo/skill.yaml`.

Use for issue-memo work products in the catalog.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
