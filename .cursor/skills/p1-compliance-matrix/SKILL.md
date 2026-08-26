---
name: p1-compliance-matrix
description: Map a corporate incident to CFAA, BSA/SAR, FCPA, FEC, ITAR, trade-secret, or RICO response obligations without live filings.
---

# p1-compliance-matrix

YAML source: `.cursor/skills/p1-compliance-matrix/skill.yaml`.

Use for corporate response obligations. This is a checklist against statutes, not a government filing client.

## Rules

- `GET http://127.0.0.1:4040/v1/corporate` → `enforcement[]`.
- Every row has `liveAction: false`.
- Search: `POST /v1/legal/search` using the row `searchQuery`.
- SAR, CISA, SEC, FEC, DDTC notices are counsel's calendar. Placeholders live in `.env.example`.
- `GET /v1/compliance/cjis` documents that live criminal-justice queries are refused.
- Do not mint wire instructions, PAC amounts, IMEIs, or intercept transcripts.
