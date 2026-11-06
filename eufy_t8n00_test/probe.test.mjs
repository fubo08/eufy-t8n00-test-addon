// Only tests diagnostic scoping, not real NVR behavior. Created with Codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {patchSource} from '../patch-sdk.mjs';
test('only the NVR start gains the opt-in per-call 1080p request',()=>{
 const fixture='audio_chn: nvr ? this.opts.channel : -1,\n          streamtype: 2,\n          stitch_mode: 1,';
 const result=patchSource(fixture);
 assert.ok(result.includes('nvr && process.env.EUFY_PROBE_1080 === "1"'));
 assert.ok(result.includes('stitch_resolution: {width: 1920, height: 1080}'));
 assert.throws(()=>patchSource('changed upstream shape'));
 assert.throws(()=>patchSource(fixture+fixture));
});
