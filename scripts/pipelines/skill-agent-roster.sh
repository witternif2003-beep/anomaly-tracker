#!/usr/bin/env bash
# Roster check for YAML skills and agent subagents.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

echo "SKILLS"
ls -1 .cursor/skills/*/skill.yaml
echo "AGENTS"
ls -1 .cursor/agents/*.md
n_skills="$(ls -1 .cursor/skills/*/skill.yaml | wc -l)"
n_agents="$(ls -1 .cursor/agents/*.md | wc -l)"
[[ "${n_skills}" -eq 20 ]] || { echo "expected 20 skills, got ${n_skills}" >&2; exit 1; }
[[ "${n_agents}" -eq 12 ]] || { echo "expected 12 agents, got ${n_agents}" >&2; exit 1; }
echo "PIPELINE OK skill-agent-roster ${n_skills} skills ${n_agents} agents"
