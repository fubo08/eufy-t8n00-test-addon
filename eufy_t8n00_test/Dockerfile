FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /sdk
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/b5f721006b49324d810ecbb93a8218e8ccf1f6ff | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm pack node-datachannel@0.33.4 --pack-destination /tmp \
    && mkdir -p node_modules/node-datachannel \
    && tar -xzf /tmp/node-datachannel-0.33.4.tgz -C node_modules/node-datachannel --strip-components=1
RUN npm run verify
COPY verify-sdk-entrypoint.test.mjs test/
