#!/bin/sh
set -eu
if [ "$(jq -r '.qualify_profile_probe // false' /data/options.json)" = true ]; then
  exec node /app/probe.mjs
fi
export EUFY_EMAIL="$(jq -r '.email' /data/options.json)"
export EUFY_PASSWORD="$(jq -r '.password' /data/options.json)"
export EUFY_COUNTRY="$(jq -r '.country' /data/options.json)"
export EUFY_SESSION=/data/.eufy-session.json
export GO2RTC_CONFIG=/data/go2rtc.yaml
exec /usr/local/bin/eufy-sdk-bridge
