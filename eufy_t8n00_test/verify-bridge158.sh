#!/usr/bin/env bash
# I qualify exact bridge sources before a regular PR. Created with Codex.
set -euo pipefail
scratch=$(mktemp -d)
files=(src/device-view.mjs src/http-routes.mjs src/ws-server.mjs go2rtc-config.mjs)
for file in "${files[@]}"; do mkdir -p "$scratch/$(dirname "$file")"; cp "$file" "$scratch/$file"; done
restore() { for file in "${files[@]}"; do cp "$scratch/$file" "$file"; done; }
trap restore EXIT
for file in "${files[@]}"; do
  curl -fsSL "https://raw.githubusercontent.com/mega-yfue/ha-eufy-sdk-bridge/1866700e7b8a4d567dbe69130263d70aebacce05/$file" -o "$file"
done
set +e
node --test test/optical-views.test.mjs > "$scratch/before.log" 2>&1
result=$?
set -e
cat "$scratch/before.log"
test "$result" -eq 1
grep -q 'fail 11' "$scratch/before.log"
grep -q 'pass 1' "$scratch/before.log"
restore
npm run lint
find . -path './node_modules' -prune -o -name '*.mjs' -print0 | xargs -0 -n1 node --check
npm test
mv node_modules/@mega-yfue/eufy-sdk /view-qualification/sdk-legacy
cp -a /view-qualification/sdk node_modules/@mega-yfue/eufy-sdk
rm -rf node_modules/@mega-yfue/eufy-sdk/node_modules/node-datachannel
ln -s /view-qualification/bridge/node_modules/node-datachannel node_modules/@mega-yfue/eufy-sdk/node_modules/node-datachannel
node --test test/optical-views.test.mjs test/stream-lifecycle.test.mjs test/snapshot-fallback.test.mjs
