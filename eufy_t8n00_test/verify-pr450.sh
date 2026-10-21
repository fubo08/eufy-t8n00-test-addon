#!/usr/bin/env bash
# I verify the proposed #450 rebase on exact source. Created with Codex.
set -euo pipefail
scratch=$(mktemp -d)
router=src/transport/rtc/command-router.ts
http=src/transport/http/mega-client.ts
cp "$router" "$scratch/router"
cp "$http" "$scratch/http"
restore() { cp "$scratch/router" "$router"; cp "$scratch/http" "$http"; }
trap restore EXIT
base=https://raw.githubusercontent.com/mega-yfue/eufy-sdk/f2f6e6efa2a3c180d928d991f0a1c53cced379ed
curl -fsSL "$base/$router" -o "$router"
set +e
NO_COLOR=1 npx vitest run src/transport/rtc/__tests__/command-router.spec.ts -t 'opens NVR camera media on the shard resolved asynchronously' > "$scratch/nvr-before.log" 2>&1
result=$?
set -e
cat "$scratch/nvr-before.log"
test "$result" -eq 1
grep -q '1 failed' "$scratch/nvr-before.log"
grep -q 'Promise' "$scratch/nvr-before.log"
restore
curl -fsSL "$base/$http" -o "$http"
set +e
NO_COLOR=1 npx vitest run src/transport/http/__tests__/rtc-shard.spec.ts -t 'portalShard' > "$scratch/portal-before.log" 2>&1
result=$?
set -e
cat "$scratch/portal-before.log"
test "$result" -eq 1
grep -q '3 failed' "$scratch/portal-before.log"
restore
npm run verify
