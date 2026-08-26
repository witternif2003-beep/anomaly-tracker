---
name: p1-local-models
description: Route work to local-v1 or local-v1-concise. Never call hosted LLMs. Use when chatting via /v1/chat/completions or the playground.
---

# p1-local-models

YAML source: `.cursor/skills/p1-local-models/skill.yaml`.

Use when chatting via /v1/chat/completions or the playground.

## Rules

- Stay on-box. Models are `local-v1` and `local-v1-concise`.
- Catalog: `GET http://127.0.0.1:4040/v1/p1`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search`.
- Map every answer to a P1 slot's `skillId`, `agentId`, and `resource`.
