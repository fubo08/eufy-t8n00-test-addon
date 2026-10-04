import { readFileSync, writeFileSync } from "node:fs";

const root = process.env.BRIDGE_PATCH_ROOT ?? "/app";
function patch(file, needle, replacement) {
  const path = `${root}/${file}`;
  const source = readFileSync(path, "utf8");
  if (source.split(needle).length !== 2)
    throw new Error(`Unexpected ${file}; review patch`);
  writeFileSync(path, source.replace(needle, replacement));
}

// The SDK can return either H.264 or H.265 Annex-B. Let ffmpeg probe the bytes
// instead of declaring every camera to be H.264 in the HTTP response.
const path = `${root}/src/http-routes.mjs`;
const original = readFileSync(path, "utf8");
const needle = '"content-type": "video/H264"';
if (original.split(needle).length !== 2)
  throw new Error("Unexpected bridge video response; review patch");
writeFileSync(
  path,
  original.replace(needle, '"content-type": "application/octet-stream"'),
);

const streamsPath = `${root}/streams.mjs`;
let streams = readFileSync(streamsPath, "utf8");
const sdkImport = "EufyMega, FileSessionStore, LoginStatus";
const realtime = "autoRealtime: false,";
if (
  streams.split(sdkImport).length !== 2 ||
  streams.split(realtime).length !== 2
) {
  throw new Error("Unexpected stream client; review logging patch");
}
streams = streams
  .replace(sdkImport, `${sdkImport}, ConsoleLogger`)
  .replace(
    realtime,
    'logger: /^(1|true|yes|on)$/i.test(process.env.BRIDGE_DEBUG_P2P ?? "") ? new ConsoleLogger() : new ConsoleLogger("info"),\n    rtcVideoIcePolicy: process.env.EUFY_RTC_VIDEO_ICE_POLICY === "all" ? "all" : "relay",\n    autoRealtime: false,',
  );
writeFileSync(streamsPath, streams);

patch(
  "src/http-routes.mjs",
  'import fs from "node:fs";',
  'import fs from "node:fs";\nimport { createNvrHandler } from "./nvr-media.mjs";',
);
patch(
  "src/http-routes.mjs",
  "export function createHttpHandler(ctx) {",
  "export function createHttpHandler(ctx) {\n  const handleNvr = createNvrHandler(ctx);",
);
patch(
  "src/http-routes.mjs",
  "    // A current still:",
  '    if (kind === "nvr-stream" || kind === "nvr-snapshot") return handleNvr(req, res, url);\n\n    // A current still:',
);
patch(
  "src/device-view.mjs",
  "import { unobservableMembers }",
  'import { nvrStreams } from "./nvr-media.mjs";\nimport { unobservableMembers }',
);
patch(
  "src/device-view.mjs",
  "      codec: m.codec,",
  "      codec: m.codec,\n      streams: nvrStreams(m.sn, m.model),",
);
patch(
  "go2rtc-config.mjs",
  "    lines.push(`  ${d.sn}: ffmpeg:",
  `    if (d.streams?.length) {
      for (const stream of d.streams) {
        lines.push(\`  \${stream.id}: ffmpeg:http://\${cfg.selfHost}:\${cfg.port}/nvr-stream/\${d.sn}/\${stream.sensor}#video=copy#audio=aac#async\`);
      }
      continue;
    }
    lines.push(\`  \${d.sn}: ffmpeg:`,
);
