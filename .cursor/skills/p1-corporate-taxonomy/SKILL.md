---
name: p1-corporate-taxonomy
description: Map internal-investigation facts onto the corporate forensic taxonomy bound to this repo. Use for business records, ESI, and compliance categories. GET /v1/corporate.
---

# p1-corporate-taxonomy

YAML source: `.cursor/skills/p1-corporate-taxonomy/skill.yaml`.

Use for corporate evidence categories in internal investigations and regulatory defense.

## Rules

- Stay on-box. `GET http://127.0.0.1:4040/v1/corporate` is the live compiler.
- Each category lists real files, lockfile packages, MCP servers, and credential placeholders from this checkout.
- Intercepts, SIGINT, live IMEI, NCIC, and SWIFT sessions are `wontDo`.
- Legal search: `POST http://127.0.0.1:4040/v1/legal/search` with `sources: ["folio","fre","glossary","corporate"]`.
- Models are `local-v1` / `local-v1-concise`. Map work to a P1 slot.
