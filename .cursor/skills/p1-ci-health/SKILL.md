---
name: p1-ci-health
description: Run P1 health and Cloudflare CI dry-run gates. Use before claiming the catalog or worker is ready. scripts/pipelines/.
---

# p1-ci-health

YAML source: `.cursor/skills/p1-ci-health/skill.yaml`.

Use before claiming the catalog or worker is ready. scripts/pipelines/.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
