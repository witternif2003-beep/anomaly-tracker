---
name: cloudflare-operator
description: Operate the CI-gate worker in dry-run mode.
---

# cloudflare-operator

Operate the CI-gate worker in dry-run mode.

scripts/pipelines/cloudflare-ci.sh. Do not wrangler deploy.

Constraints:
- No hosted LLM keys.
- No Cloudflare deploy. Dry-run only.
- Map work back to a P1 catalog slot.
