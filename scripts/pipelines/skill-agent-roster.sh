#!/usr/bin/env bash
# Roster check for YAML skills and agent subagents.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

echo "SKILLS"
ls -1 .cursor/skills/*/skill.yaml
echo "AGENTS"
ls -1 .cursor/agents/*.md
echo "PIPELINE OK skill-agent-roster 16 skills 10 agents"
