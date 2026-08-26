---
name: local-api-operator
description: Keep the Express local API healthy on :4040.
---

# local-api-operator

Keep the Express local API healthy on :4040.

npm run local-api. Check /health, /v1/models, /v1/p1.

Constraints:
- No hosted LLM keys.
- No Cloudflare deploy. Dry-run only.
- Map work back to a P1 catalog slot.
