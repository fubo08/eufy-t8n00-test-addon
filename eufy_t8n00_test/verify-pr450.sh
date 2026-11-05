#!/usr/bin/env bash
# I verify the proposed #450 rebase on exact source. Created with Codex.
set -euo pipefail
scratch=$(mktemp -d)
router=src/transport/rtc/command-router.ts
http=src/transport/http/mega-client.ts
client=src/client/eufy-mega.ts
cp "$client" "$scratch/client"
cp "$router" "$scratch/router"
cp "$http" "$scratch/http"
restore() { cp "$scratch/router" "$router"; cp "$scratch/http" "$http"; cp "$scratch/client" "$client"; }
trap restore EXIT
base=https://raw.githubusercontent.com/mega-yfue/eufy-sdk/a082fa67ed2578b34c27bb68fb81e827e6c5f111
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
curl -fsSL "$base/$router" -o "$router"
curl -fsSL "$base/$client" -o "$client"
set +e
NO_COLOR=1 npx vitest run src/client/__tests__/nvr-media-routing.spec.ts -t 'resolves the portal WEB shard through the public NVR secondary live caller' > "$scratch/public-before.log" 2>&1
result=$?
set -e
cat "$scratch/public-before.log"
test "$result" -eq 1
grep -q '1 failed' "$scratch/public-before.log"
grep -q 'ie-pr' "$scratch/public-before.log"
restore
npm run verify
