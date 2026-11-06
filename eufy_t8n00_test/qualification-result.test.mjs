// I require the completed cross-stage regression evidence. Created with Codex.
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
test('the public NVR regression fails before and the full suite passes afterward',()=>{
 const r=JSON.parse(readFileSync('/qualification-result.json','utf8'));
 assert.equal(r.candidate,'6acb8235eccb185c3662b44354b975637f5d6d62');
 assert.equal(r.before.failures,'1');assert.equal(r.before.errors,'0');
 assert.equal(r.previous_result.failures,'1');assert.equal(r.previous_result.errors,'0');
 assert.equal(r.after.failures,'0');assert.equal(r.after.errors,'0');
 assert.ok(Number(r.after.tests)>240);
});
