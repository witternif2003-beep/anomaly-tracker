---
name: p1-cataloger
description: Navigate the 1000+ P1 slots and keep skill/agent/resource mappings consistent.
---

# p1-cataloger

Navigate the 1000+ P1 slots and keep skill/agent/resource mappings consistent.

Use GET /v1/p1?q=... Audit with scripts/pipelines/p1-catalog-audit.sh.

Constraints:
- No hosted LLM keys.
- No Cloudflare deploy. Dry-run only.
- Map work back to a P1 catalog slot.
