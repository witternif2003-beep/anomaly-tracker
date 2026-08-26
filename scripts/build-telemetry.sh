#!/usr/bin/env bash
set -euo pipefail

# 3-D telemetry for build prep: temporal (when), spatial (where), causal (why).
# Never prints secret values. Caps lockfile size at 5000 entries.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

cap="${TELEMETRY_LOCKFILE_CAP:-5000}"
when="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
where="${root}"
why="${TELEMETRY_WHY:-next-build-prep}"
sha="$(git rev-parse HEAD)"
branch="$(git rev-parse --abbrev-ref HEAD)"
tracked="$(git ls-files | wc -l | tr -d ' ')"

python3 - "${when}" "${where}" "${why}" "${sha}" "${branch}" "${tracked}" "${cap}" <<'PY'
import json, os, sys
from pathlib import Path

when, where, why, sha, branch, tracked, cap = sys.argv[1:8]
cap = int(cap)
lock = json.loads(Path("package-lock.json").read_text())
pkg_count = len(lock.get("packages") or {})
if pkg_count > cap:
    raise SystemExit(f"TELEMETRY FAIL: lockfile has {pkg_count} packages; cap is {cap}")

mcp_path = Path(".cursor/mcp.json")
cred_names = [
    "CONVERSATION_PROJECT_ID",
    "CONVERSATION_KEY_ID",
    "CONVERSATION_KEY_SECRET",
    "CONVERSATION_REGION",
    "CONVERSATION_APP_ID",
]
record = {
    "temporal": {"when": when},
    "spatial": {"where": where, "branch": branch, "sha": sha, "trackedFiles": int(tracked)},
    "causal": {"why": why},
    "lockfile": {
        "present": True,
        "lockfileVersion": lock.get("lockfileVersion"),
        "packageCount": pkg_count,
        "cap": cap,
        "withinCap": True,
    },
    "mcp": {
        "configFile": str(mcp_path) if mcp_path.exists() else None,
        "inGit": mcp_path.exists(),
    },
    "credentials": {
        name: {"set": bool(os.environ.get(name)), "source": "environment"} for name in cred_names
    },
    "runtime": {
        "nodeModules": Path("node_modules").is_dir(),
    },
}
out = Path("/tmp/lyra-build-telemetry.json")
out.write_text(json.dumps(record, indent=2) + "\n")
print("TELEMETRY OK", out)
print(json.dumps(record, indent=2))
PY
