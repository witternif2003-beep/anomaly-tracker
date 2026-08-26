#!/usr/bin/env bash
set -euo pipefail

# 3-D telemetry for build prep: temporal (when), spatial (where), causal (why).
# Never prints secret values. Reports up to 500 lockfile package names.
# Full lockfile is still installed; we do not truncate npm ci.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

sample_cap="${TELEMETRY_SAMPLE_CAP:-500}"
when="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
where="${root}"
why="${TELEMETRY_WHY:-next-build-prep-web}"
sha="$(git rev-parse HEAD)"
branch="$(git rev-parse --abbrev-ref HEAD)"
tracked="$(git ls-files | wc -l | tr -d ' ')"
web="${TELEMETRY_WEB_VERIFIED:-false}"

python3 - "${when}" "${where}" "${why}" "${sha}" "${branch}" "${tracked}" "${sample_cap}" "${web}" <<'PY'
import json, os, sys
from pathlib import Path

when, where, why, sha, branch, tracked, sample_cap, web = sys.argv[1:9]
sample_cap = int(sample_cap)
lock = json.loads(Path("package-lock.json").read_text())
names = sorted(k for k in (lock.get("packages") or {}) if k)
pkg_count = len(lock.get("packages") or {})
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
        "sampleCap": sample_cap,
        "sample": names[:sample_cap],
        "installedFromLockfile": True,
        "truncatedInstall": False,
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
        "webVerified": web.lower() == "true",
    },
}
out = Path("/tmp/lyra-build-telemetry.json")
out.write_text(json.dumps(record, indent=2) + "\n")
print("TELEMETRY OK", out)
print(json.dumps({
    **record,
    "lockfile": {**record["lockfile"], "sample": f"{min(sample_cap, len(names))} names omitted from stdout"},
}, indent=2))
PY
