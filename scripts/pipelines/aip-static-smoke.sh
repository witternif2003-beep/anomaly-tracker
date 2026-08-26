#!/usr/bin/env bash
# AIP-Σ0 in-process smoke (static Pages path — no HTTP API required).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

npx --no-install tsx -e "
import { runAipDeepDive } from './src/lib/aip-sigma0/dive.ts';
import { scanText } from './src/lib/aip-sigma0/scanner.ts';
(async () => {
  const dive = await runAipDeepDive();
  if (!dive.ok) {
    console.error('PIPELINE FAIL aip-static-smoke dive', dive.proofHash);
    process.exit(1);
  }
  const review = scanText('Miranda v. Arizona held that 87% of suspects waive.', []);
  if (review.verdict !== 'review' || review.highCount < 1) {
    console.error('PIPELINE FAIL aip-static-smoke unsourced scan', review);
    process.exit(1);
  }
  const pass = scanText('Miranda v. Arizona held that 87% of suspects waive.', [
    'Miranda v. Arizona',
    '87%',
  ]);
  if (pass.verdict !== 'pass') {
    console.error('PIPELINE FAIL aip-static-smoke grounded scan', pass);
    process.exit(1);
  }
  console.log('PIPELINE OK aip-static-smoke', 'fixtures=' + dive.fixtureCount, 'proof=' + dive.proofHash.slice(0, 12));
})();
"
