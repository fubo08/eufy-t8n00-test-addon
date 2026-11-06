// Only tests diagnostic scoping, not real NVR behavior. Created with Codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patchSource} from '../patch-sdk.mjs';
import {selectCamera} from '../select-camera.mjs';
test('only the NVR start gains the opt-in per-call 1080p request',()=>{
 const fixture='audio_chn: nvr ? this.opts.channel : -1,\n          streamtype: 2,\n          stitch_mode: 1,';
 const result=patchSource(fixture);
 assert.ok(result.includes('nvr && process.env.EUFY_PROBE_1080 === "1"'));
 assert.ok(result.includes('stitch_resolution: {width: 1920, height: 1080}'));
 assert.ok(result.includes('stitch_resolution: {width: 3840, height: 2160}'));
 assert.throws(()=>patchSource('changed upstream shape'));
 assert.throws(()=>patchSource(fixture+fixture));
});
test('bind the discovered descriptor before accessing the public camera API',async()=>{
 const camera={views:()=>[0,1]};let selected;
 const result=await selectCamera({
  getDevices:async()=>[{sn:'T8000P0000000000',model:'T8N00'},{sn:'T8000P0000000001',model:'T8E00',stationSn:'T8000P0000000000'}],
  getDevice:async(sn)=>{selected=sn;return {camera:()=>camera};},
 },()=>{},'T8000P0000000001');
 assert.equal(selected,'T8000P0000000001');assert.equal(result.camera,camera);assert.deepEqual(result.camera.views(),[0,1]);
});

test('refuse missing or nonmatching targets rather than measure another S4',async()=>{
 const client={getDevices:async()=>[{sn:'NVR',model:'T8N00'},{sn:'OTHER',model:'T8E00',stationSn:'NVR'}],getDevice:async()=>{throw new Error('must not bind');}};
 await assert.rejects(selectCamera(client),/explicit diagnostic target/);
 await assert.rejects(selectCamera(client,()=>{},'MISSING'),/attached S4 missing/);
});
