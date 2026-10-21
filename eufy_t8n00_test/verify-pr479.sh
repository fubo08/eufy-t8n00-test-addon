#!/usr/bin/env bash
# I verify the exact SDK candidate and reproduce both earlier failures. Created with Codex.
set -euo pipefail
scratch=$(mktemp -d)
files=(src/client/eufy-mega.ts src/core/contracts.ts src/model/capabilities/camera.ts src/model/device-family.ts src/transport/rtc/command-router.ts src/transport/rtc/live.ts)
for file in "${files[@]}"; do
  mkdir -p "$scratch/$(dirname "$file")"
  cp "$file" "$scratch/$file"
done
restore() { for file in "${files[@]}"; do cp "$scratch/$file" "$file"; done; }
trap restore EXIT
old=https://raw.githubusercontent.com/fubo08/eufy-sdk
file=src/transport/rtc/command-router.ts
curl -fsSL "$old/2f3507092259b12e3180d7a5e141fa483a4071c1/$file" -o "$file"
set +e
NO_COLOR=1 npx vitest run src/client/__tests__/nvr-media-routing.spec.ts -t 'public non-NVR optical view boundary' > "$scratch/review-before.log" 2>&1
result=$?
set -e
cat "$scratch/review-before.log"
test "$result" -eq 1
grep -q '1 failed' "$scratch/review-before.log"
grep -q '1 passed' "$scratch/review-before.log"
grep -q '15 skipped' "$scratch/review-before.log"
restore
for file in "${files[@]}"; do
  curl -fsSL "$old/425c877c4f684e1b54318b03ed7451c0c4a90593/$file" -o "$file"
done
set +e
NO_COLOR=1 npx vitest run src/client/__tests__/nvr-media-routing.spec.ts -t 'public NVR optical view selection' > "$scratch/base-before.log" 2>&1
result=$?
set -e
tail -n 35 "$scratch/base-before.log"
test "$result" -eq 1
grep -q '7 failed' "$scratch/base-before.log"
grep -q '10 skipped' "$scratch/base-before.log"
restore
npm run verify
