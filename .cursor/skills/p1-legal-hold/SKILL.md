---
name: p1-legal-hold
description: Run the eight-step corporate investigation workflow (hold, image, custody, privilege, notice, liaison, insurance, remediate).
---

# p1-legal-hold

YAML source: `.cursor/skills/p1-legal-hold/skill.yaml`.

Use when counsel needs a preservation and production sequence for company-controlled records.

## Workflow

1. Legal hold — `GET /v1/corporate`
2. Forensic imaging — closest inventory tools only (`GET /v1/inventory`)
3. Chain of custody — AIP-Σ0 receipts (`POST /v1/aip/scan`)
4. Privilege review — FRE 501 (`POST /v1/legal/search`)
5. Regulatory notice — placeholders (`GET /v1/env`)
6. LE liaison — not CJIS (`GET /v1/compliance/cjis`)
7. Insurance — policy surface (`GET /v1/policy`)
8. Remediation — wrangler dry-run only (`npm run cf:dry-run`)

Do not intercept communications, query NCIC, or file a SAR from this process.
