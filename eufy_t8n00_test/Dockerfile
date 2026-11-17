FROM node:24-bookworm-slim AS bridge
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/bridge
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/8b6d485b926b0207eb6e209cfa1a477f697eb6d4 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test
RUN find src test -name '*.mjs' -exec node --check {} \;
RUN cp -a node_modules/@mega-yfue/eufy-sdk /qualification/sdk35 && mkdir /qualification/sdk63 && cd /qualification/sdk63 && npm pack @mega-yfue/eufy-sdk@0.6.0-beta.63 && tar -xzf *.tgz --strip-components=1 && rm *.tgz
RUN node -e 'const a=require("/qualification/sdk35/package.json"),b=require("/qualification/sdk63/package.json");require("node:assert/strict").deepEqual(a.dependencies,b.dependencies)'
RUN rm -rf node_modules/@mega-yfue/eufy-sdk && cp -a /qualification/sdk63 node_modules/@mega-yfue/eufy-sdk && npm test
FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
WORKDIR /app
RUN apk add --no-cache jq
COPY --from=bridge /qualification/bridge/package.json /qualification/bridge/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=bridge /qualification/bridge/src /app/src
COPY --from=bridge /qualification/bridge/server.mjs /qualification/bridge/streams.mjs /qualification/bridge/go2rtc-config.mjs /app/
COPY --from=bridge /qualification/bridge/bin /app/bin
COPY --from=bridge /qualification/bridge/test /app/test
COPY --from=bridge /qualification/sdk35 /opt/sdk35
COPY --from=bridge /qualification/sdk63 /opt/sdk63
RUN rm -rf node_modules/@mega-yfue/eufy-sdk && cp -a /opt/sdk63 node_modules/@mega-yfue/eufy-sdk && node --test test/*.test.mjs && rm -rf node_modules/@mega-yfue/eufy-sdk && cp -a /opt/sdk35 node_modules/@mega-yfue/eufy-sdk
COPY run.sh /run.sh
RUN chmod +x /run.sh /app/bin/start.sh && sh -n /run.sh
CMD ["/run.sh"]
