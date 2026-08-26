#!/usr/bin/env bash
# Smoke the local Express API used by P1 playground and catalog.
set -euo pipefail
base="${LOCAL_API_URL:-http://127.0.0.1:4040}"
curl -fsS --max-time 5 "${base}/health" >/dev/null
curl -fsS --max-time 5 "${base}/v1/models" >/dev/null
curl -fsS --max-time 5 "${base}/v1/p1?limit=1" >/dev/null
curl -fsS --max-time 5 "${base}/v1/env" >/dev/null
curl -fsS --max-time 5 "${base}/v1/policy" >/dev/null
curl -fsS --max-time 5 "${base}/v1/inventory" >/dev/null
curl -fsS --max-time 5 "${base}/v1/install" >/dev/null
curl -fsS --max-time 5 "${base}/v1/mode" >/dev/null
curl -fsS --max-time 8 "${base}/v1/aip/dive" >/dev/null
curl -fsS --max-time 8 "${base}/v1/notebook" >/dev/null
curl -fsS --max-time 8 "${base}/v1/corporate" >/dev/null
curl -fsS --max-time 8 "${base}/v1/anomaly" >/dev/null
curl -fsS --max-time 8 "${base}/v1/anomaly/improvements?limit=1" >/dev/null
echo "PIPELINE OK local-api-smoke ${base}"
