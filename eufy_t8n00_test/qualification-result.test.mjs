// The build stages already ran the repository verification gates. Created with Codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('contains exact candidates and recorded before/after results',()=>{
 const sdk=JSON.parse(fs.readFileSync('/qualification/sdk-before.json','utf8'));
 assert.equal(sdk.numFailedTests,4);
 assert.ok(fs.readFileSync('/qualification/integration-after.xml','utf8').includes('failures="0"'));
 assert.ok(fs.readFileSync('/qualification/integration-before.xml','utf8').includes('failures="1"'));
 const artifact=JSON.parse(fs.readFileSync('/profile-probe-sdk.json','utf8'));
 assert.equal(artifact.sdk.source,'c1d7668a899b803ff97ef648ce4873f516aedad9');
});
