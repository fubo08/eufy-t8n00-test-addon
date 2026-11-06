FROM node:24-bookworm-slim AS sdk
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/sdk
RUN curl -fsSL https://codeload.github.com/fubo08/eufy-sdk/tar.gz/aac674c095363125ab4da6f6c1a8546b19617ed8 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run verify
RUN mkdir /qualification/sdk-before && curl -fsSL https://codeload.github.com/mega-yfue/eufy-sdk/tar.gz/bbe56ed53b8ec95323d1cbc86a44e740aa9090b1 | tar -xz -C /qualification/sdk-before --strip-components=1 \
    && cp src/client/__tests__/nvr-media-routing.spec.ts /qualification/sdk-before/src/client/__tests__/nvr-media-routing.spec.ts \
    && ln -s /qualification/sdk/node_modules /qualification/sdk-before/node_modules
RUN cd /qualification/sdk-before; set +e; node node_modules/vitest/vitest.mjs run src/client/__tests__/nvr-media-routing.spec.ts -t 'keeps Full HD' --reporter=json --outputFile=/sdk-before.json; code=$?; set -e; test "$code" = 1; node -e "const r=require('/sdk-before.json');if(r.numFailedTests!==4||r.numRuntimeErrorTestSuites)process.exit(1)"

FROM node:24-bookworm-slim AS bridge
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/bridge
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/bd9dc8a316da3e779a616ebffe6f4d986209b940 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test
RUN mkdir /qualification/bridge-before && curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk-bridge/tar.gz/a59616902f6694feca69ead8bc6d9dd6962ffb90 | tar -xz -C /qualification/bridge-before --strip-components=1 \
    && cp test/optical-views.test.mjs /qualification/bridge-before/test/optical-views.test.mjs \
    && ln -s /qualification/bridge/node_modules /qualification/bridge-before/node_modules
RUN cd /qualification/bridge-before; set +e; node --test --test-name-pattern='Full HD flows' test/optical-views.test.mjs >/bridge-before.log 2>&1; code=$?; set -e; cat /bridge-before.log; test "$code" = 1; grep -q 'Full HD flows through' /bridge-before.log

FROM python:3.14-slim AS integration
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libturbojpeg0 && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/integration
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk/tar.gz/b8f4b22af15d696a56dddaee7fbd1410fec6bffc | tar -xz --strip-components=1
RUN python -m pip install --no-cache-dir -r requirements_common.txt -r requirements_dev.txt pytest
RUN python -m ruff check . && python -m ruff format --check . && python -m pytest tests/ -q --junitxml=/integration-after.xml
RUN mkdir /qualification/integration-before && curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk/tar.gz/3302c4d70e5d380b868773f140f4dfb30b3d6c89 | tar -xz -C /qualification/integration-before --strip-components=1 \
    && cp tests/test_camera_views.py /qualification/integration-before/tests/test_camera_views.py
RUN cd /qualification/integration-before; set +e; python -m pytest tests/test_camera_views.py -k full_hd -q --junitxml=/integration-before.xml; code=$?; set -e; test "$code" = 1; python -c "import xml.etree.ElementTree as E;r=E.parse('/integration-before.xml').getroot().find('testsuite');assert r.attrib['failures']=='1' and r.attrib['errors']=='0',r.attrib"

FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
WORKDIR /app
RUN apk add --no-cache jq
COPY --from=sdk /qualification/sdk/dist /app/node_modules/@mega-yfue/eufy-sdk/dist
COPY --from=bridge /qualification/bridge/src /app/src
COPY --from=bridge /qualification/bridge/server.mjs /qualification/bridge/streams.mjs /qualification/bridge/go2rtc-config.mjs /app/
COPY --from=bridge /qualification/bridge/bin /app/bin
COPY --from=integration /integration-after.xml /integration-before.xml /qualification/
COPY --from=sdk /sdk-before.json /qualification/sdk-before.json
COPY --from=bridge /bridge-before.log /qualification/bridge-before.log
COPY profile-artifact.json /profile-probe-sdk.json
COPY probe.mjs /app/probe.mjs
COPY select-camera.mjs /app/select-camera.mjs
COPY run.sh /run.sh
COPY qualification-result.test.mjs /app/test/qualification-result.test.mjs
RUN node --check /app/probe.mjs && chmod +x /run.sh /app/bin/start.sh && sh -n /run.sh
CMD ["/run.sh"]
