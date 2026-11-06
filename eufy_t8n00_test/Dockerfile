FROM node:24-bookworm-slim AS bridge
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/bridge
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/afc03ba699dae95b27e03502d2324296710ce760 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test
RUN mkdir /qualification/before && curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk-bridge/tar.gz/a59616902f6694feca69ead8bc6d9dd6962ffb90 | tar -xz -C /qualification/before --strip-components=1 && cp test/go2rtc-config.test.mjs /qualification/before/test/go2rtc-config.test.mjs && ln -s /qualification/bridge/node_modules /qualification/before/node_modules
RUN cd /qualification/before; set +e; node --test --test-name-pattern='configured H.264 conversion' test/go2rtc-config.test.mjs >/before.log 2>&1; code=$?; set -e; cat /before.log; test "$code" = 1; grep -q 'configured H.264 conversion' /before.log
FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
WORKDIR /app
RUN apk add --no-cache jq
COPY --from=bridge /qualification/bridge/src /app/src
COPY --from=bridge /qualification/bridge/server.mjs /qualification/bridge/streams.mjs /qualification/bridge/go2rtc-config.mjs /app/
COPY --from=bridge /qualification/bridge/bin /app/bin
COPY --from=bridge /qualification/bridge/test /app/test
COPY --from=bridge /before.log /qualification/secondary-before.log
COPY run.sh /run.sh
RUN chmod +x /run.sh /app/bin/start.sh && sh -n /run.sh
CMD ["/run.sh"]
