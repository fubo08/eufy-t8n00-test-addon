FROM node:24-bookworm-slim AS qualification
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/fullhd05
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/a3459db2d271736b63acb674c9fd3d51872c4379 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test
RUN node --test --test-reporter=tap test/fullhd-sdk.test.mjs > /fullhd-stable.tap && grep -q '# skipped 3' /fullhd-stable.tap
RUN cp -a /qualification/fullhd05 /qualification/fullhd78
WORKDIR /qualification/fullhd78
RUN npm install --ignore-scripts --no-save --package-lock=false @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6 && npm test
RUN node --test --test-reporter=tap test/fullhd-sdk.test.mjs > /fullhd-beta.tap && grep -q '# pass 3' /fullhd-beta.tap && grep -q '# skipped 0' /fullhd-beta.tap
RUN npm install --ignore-scripts --no-save --package-lock=false @mega-yfue/eufy-sdk@0.6.0-beta.84 node-datachannel@0.33.6 && npm test
RUN node --test --test-reporter=tap test/fullhd-sdk.test.mjs > /fullhd-beta84.tap && grep -q '# pass 3' /fullhd-beta84.tap && grep -q '# skipped 0' /fullhd-beta84.tap
WORKDIR /qualification/registry05
RUN curl -fsSL https://codeload.github.com/Couponslegrand/ha-eufy-sdk-bridge/tar.gz/f00bcf74c0f3736e38841a69796afbe06f99688e | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test
RUN find /qualification -path '*/node_modules' -prune -o -name '*.mjs' -exec node --check {} \;
RUN rm -rf /qualification/fullhd05/node_modules /qualification/fullhd78/node_modules /qualification/registry05/node_modules

FROM python:3.14-slim AS integration
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /integration
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk/tar.gz/592851b32160fc50b18e165954b920af1718f2d6 | tar -xz --strip-components=1
RUN python -m pip install --no-cache-dir -r requirements_common.txt -r requirements_dev.txt pytest
RUN python -m ruff check . && python -m ruff format --check . && python -m pytest tests/ -q --junitxml=/integration-results.xml

FROM node:24-bookworm-slim AS sdk
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /sdks/baseline
RUN curl -fsSL https://codeload.github.com/mega-yfue/eufy-sdk/tar.gz/91be47bc68fbf424121629172676a2662a339f0d | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run verify && npm prune --omit=dev --ignore-scripts
WORKDIR /sdks/candidate
RUN curl -fsSL https://codeload.github.com/mega-yfue/eufy-sdk/tar.gz/bbc529ac9fbdacdae80c7f70c97555531ba67941 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run verify && npm prune --omit=dev --ignore-scripts

FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
RUN apk add --no-cache jq
COPY --from=qualification /qualification /profiles
COPY --from=qualification /fullhd-stable.tap /qualification/fullhd-stable.tap
COPY --from=qualification /fullhd-beta.tap /qualification/fullhd-beta.tap
COPY --from=qualification /fullhd-beta84.tap /qualification/fullhd-beta84.tap
COPY --from=integration /integration-results.xml /qualification/integration-results.xml
COPY --from=sdk /sdks /sdks
WORKDIR /profiles/combined78
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/a72e983ac429a7e1e8c4e22ed2a7648b0646d54e | tar -xz --strip-components=1
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6
WORKDIR /profiles/fullhd05
RUN npm ci --omit=dev --no-audit --no-fund
WORKDIR /profiles/fullhd78
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6
WORKDIR /profiles/registry05
RUN npm ci --omit=dev --no-audit --no-fund
RUN rm -rf /app && ln -s /profiles/combined78 /app
WORKDIR /app
COPY registry-recovery.mjs /qualification/registry-recovery.mjs
RUN node --check /qualification/registry-recovery.mjs
WORKDIR /sdks/baseline
RUN npm ci --omit=dev --ignore-scripts && node -e "require('node-datachannel')"
WORKDIR /app
COPY opus-ogg.mjs /qualification/opus-ogg.mjs
COPY native-rtc-probe.mjs /qualification/native-rtc-probe.mjs
RUN node --check /qualification/native-rtc-probe.mjs
COPY run.sh /run.sh
RUN chmod +x /run.sh && sh -n /run.sh
CMD ["/run.sh"]
