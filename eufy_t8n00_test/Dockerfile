FROM node:24-bookworm-slim AS qualification
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/pacing78
RUN curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk-bridge/tar.gz/384eafba82e236fc8f2c49366e672632d305a4bf | tar -xz --strip-components=1
RUN npm ci --ignore-scripts
RUN curl -fsSL https://raw.githubusercontent.com/fubo08/ha-eufy-sdk-bridge/c915b1af2966e3ff4e5fe8ec4e956bd59b6f07ac/test/audio-route.test.mjs -o test/audio-route.test.mjs
RUN set +e; node --test --test-reporter=tap --test-name-pattern='opt-in audio reserve' test/audio-route.test.mjs > /audio-pacing-before.tap 2>&1; code=$?; set -e; test "$code" = 1; grep -q 'configured startup reserve' /audio-pacing-before.tap
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/c915b1af2966e3ff4e5fe8ec4e956bd59b6f07ac | tar -xz --strip-components=1
RUN npm run lint && npm test
RUN npm install --ignore-scripts --no-save --package-lock=false @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6 && npm test
RUN rm -rf node_modules
WORKDIR /qualification/combinedPacing78
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/4f4ee644679e5b073c35cd5cd0dd1d4b2d476623 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint
RUN npm install --ignore-scripts --no-save --package-lock=false @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6 && npm test && rm -rf node_modules

FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
RUN apk add --no-cache jq
COPY --from=qualification /qualification /profiles
WORKDIR /profiles/combined78
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/a72e983ac429a7e1e8c4e22ed2a7648b0646d54e | tar -xz --strip-components=1
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6
WORKDIR /profiles/pacing78
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6
WORKDIR /profiles/combinedPacing78
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6
RUN cmp /profiles/pacing78/src/adts-pacer.mjs /profiles/combinedPacing78/src/adts-pacer.mjs && for f in streams.mjs go2rtc-config.mjs src/live-feed.mjs src/live-still.mjs src/camera-views.mjs; do cmp "/profiles/combined78/$f" "/profiles/combinedPacing78/$f"; done
RUN rm -rf /app && ln -s /profiles/combined78 /app
WORKDIR /app
COPY sync-probe.mjs /qualification/sync-probe.mjs
RUN SYNC_FFMPEG=ffmpeg SYNC_GO2RTC=go2rtc SYNC_BUFFER_MS=384 node /qualification/sync-probe.mjs /profiles/pacing78
COPY run.sh /run.sh
RUN chmod +x /run.sh && sh -n /run.sh
CMD ["/run.sh"]
