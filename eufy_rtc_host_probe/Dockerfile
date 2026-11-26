FROM node:24-bookworm-slim AS sdk
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /sdks/candidate
RUN curl -fsSL https://codeload.github.com/mega-yfue/eufy-sdk/tar.gz/f677256f085f53a5b4da7f5d54d2ef0e8872ad7a | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run verify && npm prune --omit=dev --ignore-scripts

FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
COPY --from=sdk /sdks/candidate /sdks/candidate
COPY native-rtc-probe.mjs opus-ogg.mjs /qualification/
RUN node --check /qualification/native-rtc-probe.mjs
ENTRYPOINT ["node","/qualification/native-rtc-probe.mjs","candidate","hostCold"]
