import { readFileSync, writeFileSync } from "node:fs";

// The SDK can return either H.264 or H.265 Annex-B. Let ffmpeg probe the bytes
// instead of declaring every camera to be H.264 in the HTTP response.
const path = "/app/src/http-routes.mjs";
const original = readFileSync(path, "utf8");
const needle = '"content-type": "video/H264"';
if (original.split(needle).length !== 2) throw new Error("Unexpected bridge video response; review patch");
writeFileSync(path, original.replace(needle, '"content-type": "application/octet-stream"'));

const streamsPath = "/app/streams.mjs";
let streams = readFileSync(streamsPath, "utf8");
const sdkImport = "EufyMega, FileSessionStore, LoginStatus";
const realtime = "autoRealtime: false,";
if (streams.split(sdkImport).length !== 2 || streams.split(realtime).length !== 2) {
  throw new Error("Unexpected stream client; review logging patch");
}
streams = streams.replace(sdkImport, `${sdkImport}, ConsoleLogger`).replace(
  realtime,
  'logger: /^(1|true|yes|on)$/i.test(process.env.BRIDGE_DEBUG_P2P ?? "") ? new ConsoleLogger() : undefined,\n    autoRealtime: false,',
);
writeFileSync(streamsPath, streams);
