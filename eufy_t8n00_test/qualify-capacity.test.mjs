// My capacity harness release and session-safety checks. Created with Codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {qualifyCapacity} from './qualify-capacity.mjs';

test('invalid cached session cannot construct a client',async()=>{
  let created=false;
  await assert.rejects(qualifyCapacity({isSessionValid:()=>false,EufyMega:class{constructor(){created=true;}}},{},{}));
  assert.equal(created,false);
});

for(const limit of [4,5]) test(`measures ${limit} calls and releases all consumers without password login`,async()=>{
  const active=new Set();let closed=false,passed;
  const cameras=Array.from({length:5},(_,i)=>({sn:`T8000P000000000${i}`,model:i<2?'T8E00':'T8P00',stationSn:'synthetic-hub'}));
  const sdk={isSessionValid:()=>true,MemorySessionStore:class{save(){}},LoginStatus:{Ok:'ok'},EufyMega:class{
    constructor(o){passed=o;}on(){}async login(){return{status:'ok',session:{raw:{restored:true}}};}
    async getDevices(){return[{sn:'synthetic-hub',model:'T8N00'},...cameras];}
    async getDevice(sn){return{camera:()=>({live:async()=>{
      const consumer=new EventEmitter();let ticker;
      consumer.stop=()=>{clearInterval(ticker);active.delete(consumer);};
      if(active.size<limit){active.add(consumer);ticker=setInterval(()=>{
        consumer.emit('video',{codec:'h265',width:1920,height:1080});consumer.emit('audio',{});
      },1);}
      return consumer;
    }})};}
    async disconnect(){closed=true;}
  }};
  const report=await qualifyCapacity(sdk,{}, {email:'synthetic',password:'must-not-pass'}, {firstFrameMs:20,releaseMs:1,settleMs:5});
  assert.equal(report.status,limit===4?'four_call_limit_observed':'five_streams_observed');
  assert.equal(active.size,0);assert.equal(closed,true);assert.equal(passed.password,undefined);
  assert.equal(report.runs.length,limit===4?6:5);
  assert.ok(report.runs.at(-1).frames>1);
});
