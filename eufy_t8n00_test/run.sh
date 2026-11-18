#!/bin/sh
set -eu
case "$(jq -r '.qualification_profile // "audio"' /data/options.json)" in
  audio) profile=/opt/audio; sdk=/opt/sdk05 ;;
  fullhd) profile=/opt/fullhd; sdk=/opt/sdk70 ;;
  *) echo "Unsupported qualification profile" >&2; exit 1 ;;
esac
rm -rf /app/src /app/test /app/bin /app/node_modules/@mega-yfue/eufy-sdk
cp -a "$profile/src" "$profile/test" "$profile/bin" /app/
cp "$profile/server.mjs" "$profile/streams.mjs" "$profile/go2rtc-config.mjs" /app/
cp -a "$sdk" /app/node_modules/@mega-yfue/eufy-sdk
chmod +x /app/bin/start.sh
node -e 'console.log("Qualification profile",process.argv[1],"SDK",require("/app/node_modules/@mega-yfue/eufy-sdk/package.json").version)' "$profile"
export EUFY_EMAIL="$(jq -r '.email' /data/options.json)"
export EUFY_PASSWORD="$(jq -r '.password' /data/options.json)"
export EUFY_COUNTRY="$(jq -r '.country' /data/options.json)"
export EUFY_SESSION=/data/.eufy-session.json
export GO2RTC_CONFIG=/data/go2rtc.yaml
export TRANSCODE_H264="$(jq -r '(.transcode_h264 // []) | join(",")' /data/options.json)"
export TRANSCODE_WIDTH="$(jq -r '.transcode_width // 1920' /data/options.json)"
exec /usr/local/bin/eufy-sdk-bridge
