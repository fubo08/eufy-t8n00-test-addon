FROM node:24-bookworm-slim AS sdk
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /sdk
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/53ce090ae79c8e154d9590351bca3880efff1509 | tar -xz --strip-components=1
RUN npm ci && npm run typecheck && npx vitest run src/transport/rtc/__tests__ src/transport/p2p/__tests__/fmp4.spec.ts src/transport/p2p/__tests__/fmp4-geometry.spec.ts src/client/__tests__/rtc-command-routing.spec.ts src/client/__tests__/rtc-video-routing.spec.ts src/model \
    && npm run build && npm pack --pack-destination /tmp

FROM node:24-bookworm-slim
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl jq ffmpeg python3 make g++ cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk-bridge/tar.gz/ac95e6d186135d20c956e0f2e16add34ca257cbb | tar -xz --strip-components=1
COPY patch-bridge.mjs /tmp/patch-bridge.mjs
COPY rtc-native.mjs rtc-native-summary.mjs /app/src/
COPY rtc-native.test.mjs /app/test/rtc-native.test.mjs
COPY nvr-start-queue.mjs /app/src/nvr-start-queue.mjs
COPY nvr-start-queue.test.mjs /app/test/nvr-start-queue.test.mjs
COPY nvr-media.mjs /app/src/nvr-media.mjs
COPY nvr-media.test.mjs /app/test/nvr-media.test.mjs
COPY nvr-rtsp.test.mjs /app/test/nvr-rtsp.test.mjs
RUN node /tmp/patch-bridge.mjs && node --check src/http-routes.mjs
COPY --from=sdk /tmp/mega-yfue-eufy-sdk-0.3.0.tgz /tmp/eufy-sdk.tgz
RUN npm ci --omit=dev && npm install --no-save --omit=dev /tmp/eufy-sdk.tgz node-datachannel@0.33.4 \
    && node --input-type=module -e "await import('@mega-yfue/eufy-sdk'); const m = await import('node-datachannel'); const p = new m.PeerConnection('build-smoke', {iceServers: []}); p.close(); m.cleanup();" \
    && chmod +x bin/start.sh && ln -s /app/bin/start.sh /usr/local/bin/eufy-sdk-bridge
RUN EUFY_RTC_VIDEO_ICE_POLICY=all EUFY_RTC_VIDEO_SIGNALING_MODE=call BRIDGE_DEBUG_P2P=true node --input-type=module -e "import {strict as a} from 'node:assert'; import {streamClientOptions} from './streams.mjs'; const o = streamClientOptions({session:'/tmp/synthetic-session.json'}); a.ok(o.logger); a.equal(o.autoRealtime, false); a.equal(o.rtcVideoIcePolicy, 'all'); a.equal(o.rtcVideoSignalingMode, 'call'); (await import('node-datachannel')).cleanup();"
RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}"; case "$arch" in amd64|arm64) ;; *) exit 1;; esac; \
    curl -fsSL "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.9/go2rtc_linux_${arch}" -o /usr/local/bin/go2rtc && chmod +x /usr/local/bin/go2rtc
COPY run.sh /run.sh
RUN chmod +x /run.sh && mkdir -p /data && sh -n /run.sh
ENV BRIDGE_APP_DIR=/app BRIDGE_PORT=3000 BRIDGE_HOST=0.0.0.0 GO2RTC_CONFIG=/data/go2rtc.yaml EUFY_SESSION=/data/.eufy-session.json
EXPOSE 3000 8554
LABEL org.opencontainers.image.source="https://github.com/fubo08/eufy-t8n00-test-addon"
CMD ["/run.sh"]
