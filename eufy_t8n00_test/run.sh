#!/bin/sh
set -eu
export EUFY_EMAIL="$(jq -r '.email' /data/options.json)"
export EUFY_PASSWORD="$(jq -r '.password' /data/options.json)"
export EUFY_COUNTRY="$(jq -r '.country' /data/options.json)"
export EUFY_SESSION=/data/.eufy-session.json
export GO2RTC_CONFIG=/data/go2rtc.yaml
export TRANSCODE_H264="$(jq -r '(.transcode_h264 // []) | join(",")' /data/options.json)"
export TRANSCODE_WIDTH="$(jq -r '.transcode_width // 1920' /data/options.json)"
exec /usr/local/bin/eufy-sdk-bridge
