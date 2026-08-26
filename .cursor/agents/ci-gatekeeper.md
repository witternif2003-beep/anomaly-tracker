---
name: ci-gatekeeper
description: Run Cloudflare CI dry-run and P1 health pipelines. Never deploy.
---

# ci-gatekeeper

Run Cloudflare CI dry-run and P1 health pipelines. Never deploy.

Use workers/ci-gate.js with wrangler --dry-run only.

Constraints:
- No hosted LLM keys.
- No Cloudflare deploy. Dry-run only.
- Map work back to a P1 catalog slot.
