#!/bin/sh
set -eu
profile="$(jq -r '.qualification_profile // "combined78"' /data/options.json)"
case "$profile" in audio) profile=primer05 ;; fullhd) profile=combined78 ;; primer05|registry05|combined70|combined78|optical78|audio78) ;; *) echo 'Unsupported qualification profile' >&2; exit 1 ;; esac
cd "/profiles/$profile"
node -e 'console.log("Qualification profile",process.argv[1],"SDK",require("./node_modules/@mega-yfue/eufy-sdk/package.json").version,"datachannel",require("./node_modules/node-datachannel/package.json").version)' "$profile"
export EUFY_EMAIL="$(jq -r '.email' /data/options.json)"
export EUFY_PASSWORD="$(jq -r '.password' /data/options.json)"
export EUFY_COUNTRY="$(jq -r '.country' /data/options.json)"
export EUFY_SESSION=/data/.eufy-session.json
export GO2RTC_CONFIG=/data/go2rtc.yaml
export BRIDGE_APP_DIR="/profiles/$profile"
if [ "$profile" = audio78 ]; then export NODE_OPTIONS="--import=/profiles/audio78/audio-timing-diagnostic.mjs"; fi
exec node server.mjs
