FROM node:24-bookworm-slim AS capacityqualification
WORKDIR /capacity-qualification/sdk
RUN npm pack @mega-yfue/eufy-sdk@0.5.0-beta.74 --pack-destination /tmp \
    && tar -xzf /tmp/mega-yfue-eufy-sdk-0.5.0-beta.74.tgz --strip-components=1 \
    && node -e "if(require('./package.json').version!=='0.5.0-beta.74')process.exit(1)"
FROM node:24-bookworm-slim AS mediaqualification
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /media-qualification/sdk
COPY verify-pr479.sh /tmp/verify-pr479.sh
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/dd35b27fc2eccbd318fcec671f8d806b6a8ed54f | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm pack node-datachannel@0.33.4 --pack-destination /tmp \
    && mkdir -p node_modules/node-datachannel && tar -xzf /tmp/node-datachannel-0.33.4.tgz -C node_modules/node-datachannel --strip-components=1 \
    && bash /tmp/verify-pr479.sh && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS portalqualification
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /portal-qualification/sdk
COPY verify-pr450.sh /tmp/verify-pr450.sh
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/e34c7cfe3f379c9286cf7a297b5b2fc1f1323eda | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm pack node-datachannel@0.33.4 --pack-destination /tmp \
    && mkdir -p node_modules/node-datachannel && tar -xzf /tmp/node-datachannel-0.33.4.tgz -C node_modules/node-datachannel --strip-components=1 \
    && bash /tmp/verify-pr450.sh && npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim AS ptzqualification
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /ptz-qualification/sdk
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/d8a4167bf1018fa8816f05127d6c38a031050420 | tar -xz --strip-components=1
# The optional native peer's declarations are needed for compilation; the runtime uses /app's tested native binary.
RUN npm ci --ignore-scripts && npm pack node-datachannel@0.33.4 --pack-destination /tmp \
    && mkdir -p node_modules/node-datachannel && tar -xzf /tmp/node-datachannel-0.33.4.tgz -C node_modules/node-datachannel --strip-components=1 \
    && npm run typecheck && npm run build

FROM node:24-bookworm-slim AS cameraqualification
WORKDIR /camera-qualification/sdk
# Published, unmodified official npm package requested in PR #354.
RUN npm pack @mega-yfue/eufy-sdk@0.5.0-beta.22 --pack-destination /tmp \
    && tar -xzf /tmp/mega-yfue-eufy-sdk-0.5.0-beta.22.tgz --strip-components=1 \
    && node -e "if(require('./package.json').version!=='0.5.0-beta.22')process.exit(1)"

FROM node:24-bookworm-slim AS qualification
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/sdk
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/897201955d58e4ce1932e5d27575528f648d8e43 | tar -xz --strip-components=1
# The optional native peer's declarations are needed for compilation; the runtime uses /app's tested native binary.
RUN npm ci --ignore-scripts && npm pack node-datachannel@0.33.4 --pack-destination /tmp \
    && mkdir -p node_modules/node-datachannel && tar -xzf /tmp/node-datachannel-0.33.4.tgz -C node_modules/node-datachannel --strip-components=1 \
    && npm run typecheck && npm run build

FROM node:24-bookworm-slim AS sdk
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ cmake && rm -rf /var/lib/apt/lists/*
WORKDIR /sdk
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/4abbb6b849552765229945356b63bd4487056b0b | tar -xz --strip-components=1
COPY patch-sdk.mjs /tmp/patch-sdk.mjs
RUN node /tmp/patch-sdk.mjs
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
COPY media-pacer.mjs /app/src/media-pacer.mjs
COPY media-pacer.test.mjs /app/test/media-pacer.test.mjs
COPY nvr-start-queue.mjs /app/src/nvr-start-queue.mjs
COPY nvr-start-queue.test.mjs /app/test/nvr-start-queue.test.mjs
COPY nvr-media.mjs /app/src/nvr-media.mjs
COPY nvr-snapshot.mjs /app/src/nvr-snapshot.mjs
COPY nvr-preview-cache.mjs /app/src/nvr-preview-cache.mjs
COPY nvr-preview-quality.mjs /app/src/nvr-preview-quality.mjs
COPY nvr-preview-quality.test.mjs /app/test/nvr-preview-quality.test.mjs
COPY nvr-preview-cache.test.mjs /app/test/nvr-preview-cache.test.mjs
COPY nvr-preview-routes.test.mjs /app/test/nvr-preview-routes.test.mjs
COPY nvr-playback.mjs /app/src/nvr-playback.mjs
COPY nvr-snapshot.test.mjs /app/test/nvr-snapshot.test.mjs
COPY nvr-media.test.mjs /app/test/nvr-media.test.mjs
COPY nvr-rtsp.test.mjs /app/test/nvr-rtsp.test.mjs
RUN node /tmp/patch-bridge.mjs && node --check src/http-routes.mjs
COPY --from=sdk /tmp/mega-yfue-eufy-sdk-0.3.0.tgz /tmp/eufy-sdk.tgz
RUN npm ci --omit=dev && npm install --no-save --omit=dev /tmp/eufy-sdk.tgz node-datachannel@0.33.4 \
    && node --input-type=module -e "await import('@mega-yfue/eufy-sdk'); const m = await import('node-datachannel'); const p = new m.PeerConnection('build-smoke', {iceServers: []}); p.close(); m.cleanup();" \
    && chmod +x bin/start.sh && ln -s /app/bin/start.sh /usr/local/bin/eufy-sdk-bridge
RUN EUFY_RTC_VIDEO_START_MODE=direct EUFY_RTC_VIDEO_ICE_POLICY=all EUFY_RTC_VIDEO_SIGNALING_MODE=call BRIDGE_DEBUG_P2P=true node --input-type=module -e "import {strict as a} from 'node:assert'; import {streamClientOptions} from './streams.mjs'; const o = streamClientOptions({session:'/tmp/synthetic-session.json'}); a.ok(o.logger); a.equal(o.autoRealtime, false); a.equal(o.rtcVideoIcePolicy, 'all'); a.equal(o.rtcVideoSignalingMode, 'call'); a.equal(o.rtcVideoStartMode, 'direct'); (await import('node-datachannel')).cleanup();"
RUN EUFY_RTC_COMMAND_ICE_POLICY=all EUFY_RTC_COMMAND_SIGNALING_MODE=call node --input-type=module -e "import {strict as a} from 'node:assert'; import {createEufy} from './src/client.mjs'; const c=createEufy({cfg:{email:'test@example.com',password:'synthetic',country:'DE',session:'/tmp/synthetic-session.json',pushSession:'/tmp/synthetic-push.json',pollMs:0,prewarm:false},DEBUG_P2P:false}); a.equal(c.rtc.deps.signalingMode,'call'); a.equal(c.rtc.deps.iceTransportPolicy,'all'); (await import('node-datachannel')).cleanup();"
RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}"; case "$arch" in amd64|arm64) ;; *) exit 1;; esac; \
    curl -fsSL "https://github.com/AlexxIT/go2rtc/releases/download/v1.9.9/go2rtc_linux_${arch}" -o /usr/local/bin/go2rtc && chmod +x /usr/local/bin/go2rtc
COPY --from=ptzqualification /ptz-qualification/sdk/dist /ptz-qualification/sdk/dist
COPY --from=ptzqualification /ptz-qualification/sdk/package.json /ptz-qualification/sdk/package.json
COPY qualify-ptz.mjs qualify-ptz.test.mjs /ptz-qualification/
RUN ln -s /app/node_modules /ptz-qualification/sdk/node_modules && node --test /ptz-qualification/qualify-ptz.test.mjs
COPY --from=mediaqualification /media-qualification/sdk /media-qualification/sdk
COPY --from=portalqualification /portal-qualification/sdk /portal-qualification/sdk
RUN rm -rf /portal-qualification/sdk/node_modules/node-datachannel \
    && ln -s /app/node_modules/node-datachannel /portal-qualification/sdk/node_modules/node-datachannel
COPY qualify-media.mjs qualify-media.test.mjs nvr-beta-live-feed.mjs nvr-beta-live-feed.test.mjs /media-qualification/
RUN rm -rf /media-qualification/sdk/node_modules/node-datachannel \
    && ln -s /app/node_modules/node-datachannel /media-qualification/sdk/node_modules/node-datachannel \
    && node --test /media-qualification/nvr-beta-live-feed.test.mjs \
    && node --test /media-qualification/qualify-media.test.mjs \
    && node --input-type=module -e "const m=await import('/media-qualification/sdk/dist/index.js'); if(typeof m.EufyMega!=='function')process.exit(1)"
COPY --from=capacityqualification /capacity-qualification/sdk /capacity-qualification/sdk
COPY qualify-capacity.mjs qualify-capacity.test.mjs /capacity-qualification/
COPY qualify-grid.mjs qualify-grid.test.mjs nvr-beta-live-feed.mjs /capacity-qualification/
RUN ln -s /app/node_modules /capacity-qualification/sdk/node_modules \
    && node --test /capacity-qualification/qualify-capacity.test.mjs \
    && node --test /capacity-qualification/qualify-grid.test.mjs \
    && node --input-type=module -e "const s=await import('/capacity-qualification/sdk/dist/index.js'); if(typeof s.EufyMega!=='function')process.exit(1)"
COPY run.sh /run.sh
COPY --from=cameraqualification /camera-qualification/sdk /camera-qualification/sdk
COPY qualify-camera.mjs qualify-camera.test.mjs /camera-qualification/
RUN ln -s /app/node_modules /camera-qualification/sdk/node_modules \
    && node --test /camera-qualification/qualify-camera.test.mjs \
    && node --input-type=module -e "const s=await import('/camera-qualification/sdk/dist/index.js'); if(typeof s.EufyMega!=='function'||typeof s.isSessionValid!=='function')process.exit(1)"
COPY --from=qualification /qualification/sdk/dist /qualification/sdk/dist
COPY --from=qualification /qualification/sdk/package.json /qualification/sdk/package.json
COPY qualify-pr354.mjs qualify-pr354.test.mjs /qualification/
RUN ln -s /app/node_modules /qualification/sdk/node_modules \
    && node --test /qualification/qualify-pr354.test.mjs \
    && node --input-type=module -e "const s=await import('/qualification/sdk/dist/index.js'); if(typeof s.EufyMega!=='function'||typeof s.isSessionValid!=='function')process.exit(1)"
RUN chmod +x /run.sh && mkdir -p /data && sh -n /run.sh
ENV BRIDGE_APP_DIR=/app BRIDGE_PORT=3000 BRIDGE_HOST=0.0.0.0 GO2RTC_CONFIG=/data/go2rtc.yaml EUFY_SESSION=/data/.eufy-session.json BRIDGE_PREVIEW_CACHE_DIR=/data/nvr-previews
EXPOSE 3000 8554
LABEL org.opencontainers.image.source="https://github.com/fubo08/eufy-t8n00-test-addon"
CMD ["/run.sh"]
