FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
WORKDIR /app
RUN apk add --no-cache jq
COPY patch-sdk.mjs /app/patch-sdk.mjs
COPY probe.test.mjs /app/test/profile-probe.test.mjs
RUN node /app/patch-sdk.mjs && node --check node_modules/@mega-yfue/eufy-sdk/dist/index.js && node --test /app/test/profile-probe.test.mjs
COPY probe.mjs /app/probe.mjs
COPY run.sh /run.sh
RUN node --check /app/probe.mjs && chmod +x /run.sh && sh -n /run.sh
CMD ["/run.sh"]
