// I require the completed cross-stage regression evidence. Created with Codex.
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('the public NVR regression fails before and the full suite passes afterward',()=>{
 const r=JSON.parse(readFileSync('/qualification-result.json','utf8'));
 assert.equal(r.candidate,'e84d7fc145b7ca0f574c9a0f889ccfa7ba272305');
 assert.equal(r.before.failures,'1');assert.equal(r.before.errors,'0');
 assert.equal(r.after.failures,'0');assert.equal(r.after.errors,'0');
 assert.ok(Number(r.after.tests)>240);
});
