FROM node:24-bookworm-slim AS audio
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/audio
RUN curl -fsSL https://codeload.github.com/Bielecki-UK/ha-eufy-sdk-bridge/tar.gz/22f18a74b1d6ddf64ab7ebbd258a0b79b06a3d08 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test
FROM audio AS fullhd
WORKDIR /qualification/fullhd
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/451487d92dc50b815f4d3af6a7db3f92abc4dff4 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint
RUN find src test -name '*.mjs' -exec node --check {} \;
RUN set +e; node --test --test-reporter=tap test/*.test.mjs >/qualification/pinned.tap 2>&1; code=$?; set -e; cat /qualification/pinned.tap; test "$code" = 1; grep -q '^# fail 3$' /qualification/pinned.tap; test "$(grep -c '^not ok .*published SDK advertises' /qualification/pinned.tap)" = 3
RUN mkdir /qualification/sdk70 && cd /qualification/sdk70 && npm pack @mega-yfue/eufy-sdk@0.6.0-beta.70 && tar -xzf *.tgz --strip-components=1 && rm *.tgz
RUN node -e 'require("node:assert/strict").deepEqual(require("./node_modules/@mega-yfue/eufy-sdk/package.json").dependencies,require("/qualification/sdk70/package.json").dependencies)'
RUN rm -rf node_modules/@mega-yfue/eufy-sdk && cp -a /qualification/sdk70 node_modules/@mega-yfue/eufy-sdk && npm test
RUN mkdir /qualification/before && curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk-bridge/tar.gz/384eafb | tar -xz -C /qualification/before --strip-components=1 && cp test/audio-route.test.mjs /qualification/before/test/audio-route.test.mjs && ln -s /qualification/fullhd/node_modules /qualification/before/node_modules
RUN cd /qualification/before; set +e; node --test --test-reporter=tap --test-name-pattern='Full HD audio forwards' test/audio-route.test.mjs >/qualification/audio-before.tap 2>&1; code=$?; set -e; cat /qualification/audio-before.tap; test "$code" = 1; grep -q '^# fail 1$' /qualification/audio-before.tap
FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
WORKDIR /app
RUN apk add --no-cache jq
COPY --from=audio /qualification/audio/package.json /qualification/audio/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=audio /qualification/audio /opt/audio
COPY --from=fullhd /qualification/fullhd /opt/fullhd
COPY --from=fullhd /qualification/pinned.tap /qualification/audio-before.tap /qualification/
RUN rm -rf /opt/audio/node_modules /opt/fullhd/node_modules
COPY --from=audio /qualification/audio/node_modules/@mega-yfue/eufy-sdk /opt/sdk05
COPY --from=fullhd /qualification/sdk70 /opt/sdk70
RUN cp -a /opt/audio/src /opt/audio/test /opt/audio/bin /app/ && cp /opt/audio/server.mjs /opt/audio/streams.mjs /opt/audio/go2rtc-config.mjs /app/
COPY run.sh /run.sh
RUN chmod +x /run.sh && sh -n /run.sh
CMD ["/run.sh"]
