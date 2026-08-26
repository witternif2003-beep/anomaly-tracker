#!/usr/bin/env bash
# Confirm every P1 slot maps to a skill, agent, and on-disk resource.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

python3 - <<'PY'
from pathlib import Path
skills = list(Path(".cursor/skills").glob("*/skill.yaml"))
agents = list(Path(".cursor/agents").glob("*.md"))
pipelines = list(Path("scripts/pipelines").glob("*.sh"))
worker = Path("workers/ci-gate.js")
assert len(skills) == 16, len(skills)
assert len(agents) == 10, len(agents)
assert len(pipelines) >= 5, len(pipelines)
assert worker.is_file()
print("PIPELINE OK p1-catalog-audit", len(skills), "skills", len(agents), "agents", len(pipelines), "pipelines")
PY
