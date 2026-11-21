FROM node:24-bookworm-slim AS qualification
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /qualification/primer05
RUN curl -fsSL https://codeload.github.com/Bielecki-UK/ha-eufy-sdk-bridge/tar.gz/89d371442fa82c2d5736792e97dc53e7a76c14ea | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test && rm -rf node_modules
WORKDIR /qualification/registry05
RUN curl -fsSL https://codeload.github.com/Couponslegrand/ha-eufy-sdk-bridge/tar.gz/4105a0f40888aed79c1001a5bf61264035f45600 | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint && npm test && rm -rf node_modules
WORKDIR /qualification/combined78
RUN curl -fsSL https://codeload.github.com/fubo08/ha-eufy-sdk-bridge/tar.gz/a72e983ac429a7e1e8c4e22ed2a7648b0646d54e | tar -xz --strip-components=1
RUN npm ci --ignore-scripts && npm run lint
RUN npm install --ignore-scripts --no-save --package-lock=false @mega-yfue/eufy-sdk@0.6.0-beta.70 node-datachannel@0.33.6 && npm test
RUN mkdir /sdk70 && cp -a node_modules/@mega-yfue/eufy-sdk/. /sdk70/
RUN npm install --ignore-scripts --no-save --package-lock=false @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6 && npm test
RUN find src test -name '*.mjs' -exec node --check {} \;
RUN rm -rf node_modules
FROM python:3.14-slim AS integration
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /integration
RUN curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk/tar.gz/d280f8f707fc32b893f9d3527b8c729d7d627027 | tar -xz --strip-components=1
RUN python -m pip install --no-cache-dir -r requirements_common.txt -r requirements_dev.txt pytest
RUN set +e; python -m pytest tests/test_translations.py -q --junitxml=/translation-before.xml; code=$?; set -e; test "$code" = 1; python -c "import xml.etree.ElementTree as E;r=E.parse('/translation-before.xml').getroot().find('testsuite');assert r.attrib['failures']=='1' and r.attrib['errors']=='0',r.attrib;assert any('pl.json' in (f.text or '') for f in r.iter('failure'))"
RUN curl -fsSL https://raw.githubusercontent.com/fubo08/ha-eufy-sdk/5b723495764dc8a491df2dc7cacae399673eb4ba/custom_components/eufy_sdk/translations/pl.json -o custom_components/eufy_sdk/translations/pl.json
RUN python -m ruff check . && python -m ruff format --check . && python -m pytest tests/ -q --junitxml=/integration-results.xml
FROM ghcr.io/mega-yfue/ha-eufy-sdk-bridge:0.7.2
RUN apk add --no-cache jq
COPY --from=qualification /qualification /profiles
COPY --from=qualification /sdk70 /sdk70
COPY --from=integration /integration-results.xml /qualification/integration-results.xml
WORKDIR /profiles/primer05
RUN npm ci --omit=dev --no-audit --no-fund
WORKDIR /profiles/registry05
RUN npm ci --omit=dev --no-audit --no-fund
WORKDIR /profiles/combined78
RUN npm install --omit=dev --no-save --package-lock=false --no-audit --no-fund @mega-yfue/eufy-sdk@0.6.0-beta.78 node-datachannel@0.33.6
RUN cp -a /profiles/combined78 /profiles/combined70 && rm -rf /profiles/combined70/node_modules/@mega-yfue/eufy-sdk && cp -a /sdk70 /profiles/combined70/node_modules/@mega-yfue/eufy-sdk
RUN rm -rf /app && ln -s /profiles/combined78 /app
WORKDIR /app
COPY run.sh /run.sh
RUN chmod +x /run.sh && sh -n /run.sh
CMD ["/run.sh"]
