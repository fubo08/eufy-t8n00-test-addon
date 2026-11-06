FROM python:3.14-slim AS qualification
WORKDIR /integration
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libturbojpeg0 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://codeload.github.com/mega-yfue/ha-eufy-sdk/tar.gz/215f66b5b9d15b0758d8a7e2b4173b0588b052fb | tar -xz --strip-components=1
RUN python -m pip install --no-cache-dir -r requirements_common.txt -r requirements_dev.txt pytest
COPY test_nvr_availability_qualification.py tests/test_nvr_availability_qualification.py
COPY verify-availability169.py /tmp/verify-availability169.py
RUN PYTHONPATH=.:tests python /tmp/verify-availability169.py
FROM node:24-bookworm-slim
WORKDIR /qualification
COPY --from=qualification /qualification-result.json /qualification-result.json
COPY qualification-result.test.mjs test/qualification-result.test.mjs
