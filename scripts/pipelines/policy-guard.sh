#!/usr/bin/env bash
# Assert YOLO disabled, background agents activated, marketplace integrated, dry-run only.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

python3 - <<'PY'
import json
from pathlib import Path

perm = json.loads(Path(".cursor/permissions.json").read_text())
assert perm["terminalAllowlist"] == []
assert perm["mcpAllowlist"] == []
assert perm["autoRun"]["allow_instructions"] == []
assert any("YOLO" in x or "Auto-Run" in x for x in perm["autoRun"]["block_instructions"])

settings = json.loads(Path(".vscode/settings.json").read_text())
assert settings.get("cursor.agent.autoRun") is False
assert settings.get("cursor.agent.yoloMode") is False
assert settings.get("cursor.agent.backgroundComposer.enabled") is True

env = json.loads(Path(".cursor/environment.json").read_text())
assert env.get("install")
assert env.get("start")
ports = {p["port"] for p in env.get("ports", [])}
assert {4040, 43127} <= ports

market = json.loads(Path(".cursor/marketplace.json").read_text())
ids = {p["id"] for p in market["plugins"]}
assert {"saoudrizwan.claude-dev", "RooVeterinaryInc.roo-cline", "Continue.continue"} <= ids
assert Path(".continue/config.yaml").is_file()
assert Path(".clinerules").is_file()
assert Path(".roo/rules.md").is_file()
assert Path("data/legal/glossary.json").is_file()
print("PIPELINE OK policy-guard yolo-off background-on marketplace-integrated")
PY
echo "PIPELINE OK policy-guard"
