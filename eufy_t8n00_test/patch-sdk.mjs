// Diagnostic-only change to the exact published SDK. Created with Codex.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function patchSource(source) {
  const needle = 'audio_chn: nvr ? this.opts.channel : -1,\n          streamtype: 2,\n          stitch_mode: 1,';
  assert.equal(source.split(needle).length, 2, 'one exact NVR live-start target required');
  return source.replace(needle, needle + '\n          ...(nvr && process.env.EUFY_PROBE_1080 === "1" ? {stitch_resolution: {width: 1920, height: 1080}} : nvr && process.env.EUFY_PROBE_4K === "1" ? {stitch_resolution: {width: 3840, height: 2160}} : {}),');
}
if (process.argv[1]?.endsWith('/patch-sdk.mjs')) {
  const file='/app/node_modules/@mega-yfue/eufy-sdk/dist/index.js';
  const source=fs.readFileSync(file,'utf8');
  const hash=createHash('sha256').update(source).digest('hex');
  assert.equal(hash,'1fda8bc8096011164399300810afd80e42eaec48e0cb9132b92d1598ac4ad7c0','exact npm SDK 0.5.0 required');
  const patched=patchSource(source);
  fs.writeFileSync(file,patched);
  fs.writeFileSync('/profile-probe-sdk.json', JSON.stringify({sdk:'0.5.0',source:'5f92bea559fa1a5b619a84a9966ccc90a541735e',originalSha256:hash,patchedSha256:createHash('sha256').update(patched).digest('hex')}));
}
