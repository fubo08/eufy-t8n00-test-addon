// My sanitized boundary-observer checks. Created with Codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {signalMetadata,observeSessions,wireMetadata} from './capacity-signaling.mjs';
test('classifies raw envelopes before SDK parsing without retaining payloads',()=>{
  const raw=JSON.stringify({msgid:'PRIVATE',data:JSON.stringify({dataType:'call',data:JSON.stringify({status:100,turn:{secret:'PRIVATE'}})})});
  assert.deepEqual(wireMetadata(raw),{shape:'sdk-envelope',type:'call',status:100,hasTurn:true});
  assert.deepEqual(wireMetadata(Buffer.from(raw)),wireMetadata(raw));
  assert.deepEqual(wireMetadata('{'),{shape:'unparsed'});
  assert.deepEqual(wireMetadata(JSON.stringify({data:{secret:'PRIVATE'}})),{shape:'non-string-envelope-data'});
});
test('retains status and presence only, dropping secrets and malformed payloads',()=>{
  const inner={dataType:'call',action:3,code:200,isResponse:1,sn:'PRIVATE',data:JSON.stringify({status:100,turn:{password:'PRIVATE'},token:'PRIVATE'})};
  assert.deepEqual(signalMetadata(inner),{type:'call',action:3,code:200,isResponse:1,status:100,hasTurn:true});
  assert.deepEqual(signalMetadata({dataType:'PRIVATE',data:'bad'}),{type:'other'});
  assert.deepEqual(signalMetadata({dataType:'info',data:JSON.stringify({format:'SDP',value:'PRIVATE'})}),{type:'info',hasSdp:true,hasCandidate:false});
});
for(const mode of ['call','scall'])test(`observes distinct sessions and ${mode} without changing send results`,()=>{
  const events=[],routes=[];
  const client={rtc:{newSession(route){routes.push(route);const s=new EventEmitter();s.signaling=new EventEmitter();s.signaling.sendSession=()=>42;return s;}}};
  const before=client.rtc.newSession;const restore=observeSessions(client,mode,e=>events.push(e));
  const a=client.rtc.newSession({cameraSn:'PRIVATE'}),b=client.rtc.newSession({cameraSn:'PRIVATE'});
  assert.equal(routes[0].signalingMode,mode);assert.equal(routes[0].cameraSn,'PRIVATE');
  a.signaling.emit('message',{dataType:mode,data:JSON.stringify({status:100,turn:{secret:'PRIVATE'}})});
  b.signaling.emit('message',{dataType:'info',data:JSON.stringify({sdp:'PRIVATE'})});
  assert.equal(a.signaling.sendSession('info',{sdp:'PRIVATE'}),42);
  assert.ok(events.some(e=>e.session===1&&e.status===100));assert.ok(events.some(e=>e.session===2&&e.hasSdp));
  a.emit('close');assert.equal(a.signaling.listenerCount('message'),0);restore();assert.equal(client.rtc.newSession,before);
  assert.ok(!JSON.stringify(events).includes('PRIVATE'));
});
