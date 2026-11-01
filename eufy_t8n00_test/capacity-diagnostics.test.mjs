// My failure-classification and privacy checks. Created with Codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {failureMetadata,traceMetadata} from './capacity-diagnostics.mjs';

test('retains typed stage and nested remote refusal without retaining private message text',()=>{
  const root = Object.assign(new Error('private camera must-not-leak',{cause:new Error('RTC PRIVATE-SERIAL scall answered 486')}),
    {name:'LiveStreamStartError',reason:'source-error',stage:'awaiting-first-frame',timeoutMs:20000,attempts:1});
  const actual=failureMetadata(root);
  assert.deepEqual(actual,{kind:'live-start',reason:'source-error',stage:'awaiting-first-frame',attempts:1,timeoutMs:20000,cause:{kind:'remote-call-status',status:486}});
  assert.ok(!JSON.stringify(actual).includes('PRIVATE'));
});
test('distinguishes start refusal, auth timeout, native failure, and no-first-frame timeout',()=>{
  assert.deepEqual(failureMetadata(new Error('rtc live PRIVATE#3: start refused (err -2)')),{kind:'media-start-refused',code:-2});
  assert.equal(failureMetadata(new Error('RTC signalling auth timeout')).kind,'signaling-auth-timeout');
  assert.equal(failureMetadata(new Error('could not load the native peer: PRIVATE')).kind,'native-peer-error');
  assert.deepEqual(failureMetadata(Object.assign(new Error('PRIVATE'),{name:'LiveStreamStartError',reason:'warm-timeout',stage:'awaiting-first-frame'})),{kind:'live-start',reason:'warm-timeout',stage:'awaiting-first-frame'});
});
test('bounds cycles and drops unknown fields and log payloads',()=>{
  const error = new Error('password: must-not-leak'); error.cause=error;
  assert.deepEqual(failureMetadata(error),{kind:'unclassified'});
  assert.equal(traceMetadata('[rtc] wire video #1 PRIVATE'),undefined);
  assert.deepEqual(traceMetadata('[rtc] PRIVATE signalling closed 1006 PRIVATE'),{event:'signaling-closed',code:1006});
  assert.deepEqual(traceMetadata('[rtc] peer state connected'),{event:'peer-state',state:'connected'});
  assert.deepEqual(traceMetadata('[rtc] data channel open video'),{event:'data-channel',state:'open',channel:'video'});
  assert.equal(traceMetadata('[rtc] unknown must-not-leak'),undefined);
});
