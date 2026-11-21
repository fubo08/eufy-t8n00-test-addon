#!/bin/sh
set -eu
profile="$(jq -r '.qualification_profile // "combined78"' /data/options.json)"
case "$profile" in combined78|pacing78|combinedPacing78) ;; *) echo 'Unsupported audio qualification profile' >&2; exit 1 ;; esac
cd "/profiles/$profile"
node -e 'console.log("Qualification profile",process.argv[1],"SDK",require("./node_modules/@mega-yfue/eufy-sdk/package.json").version,"datachannel",require("./node_modules/node-datachannel/package.json").version)' "$profile"
export EUFY_EMAIL="$(jq -r '.email' /data/options.json)"
export EUFY_PASSWORD="$(jq -r '.password' /data/options.json)"
export EUFY_COUNTRY="$(jq -r '.country' /data/options.json)"
export EUFY_SESSION=/data/.eufy-session.json
export GO2RTC_CONFIG=/data/go2rtc.yaml
export BRIDGE_APP_DIR="/profiles/$profile"
case "$profile" in pacing78|combinedPacing78) export BRIDGE_AUDIO_BUFFER_MS="$(jq -r '.audio_buffer_ms // 384' /data/options.json)" ;; *) export BRIDGE_AUDIO_BUFFER_MS=0 ;; esac
exec node server.mjs
