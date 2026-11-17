#!/bin/sh
set -eu
case "$(jq -r '.qualification_sdk // "beta35"' /data/options.json)" in
  beta35) sdk=/opt/sdk35 ;;
  beta63) sdk=/opt/sdk63 ;;
  *) echo "Unsupported qualification SDK" >&2; exit 1 ;;
esac
rm -rf /app/node_modules/@mega-yfue/eufy-sdk
cp -a "$sdk" /app/node_modules/@mega-yfue/eufy-sdk
node -e 'console.log("Qualification SDK",require("/app/node_modules/@mega-yfue/eufy-sdk/package.json").version)'
export EUFY_EMAIL="$(jq -r '.email' /data/options.json)"
export EUFY_PASSWORD="$(jq -r '.password' /data/options.json)"
export EUFY_COUNTRY="$(jq -r '.country' /data/options.json)"
export EUFY_SESSION=/data/.eufy-session.json
export GO2RTC_CONFIG=/data/go2rtc.yaml
export TRANSCODE_H264="$(jq -r '(.transcode_h264 // []) | join(",")' /data/options.json)"
export TRANSCODE_WIDTH="$(jq -r '.transcode_width // 1920' /data/options.json)"
exec /usr/local/bin/eufy-sdk-bridge
