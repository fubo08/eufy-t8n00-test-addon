import { readFileSync, writeFileSync } from "node:fs";

// The SDK can return either H.264 or H.265 Annex-B. Let ffmpeg probe the bytes
// instead of declaring every camera to be H.264 in the HTTP response.
const path = "/app/src/http-routes.mjs";
const original = readFileSync(path, "utf8");
const needle = '"content-type": "video/H264"';
if (original.split(needle).length !== 2) throw new Error("Unexpected bridge video response; review patch");
writeFileSync(path, original.replace(needle, '"content-type": "application/octet-stream"'));
