// My capacity harness release and session-safety checks. Created with Codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {qualifyCapacity} from './qualify-capacity-current.mjs';

test('invalid cached session cannot construct a client',async()=>{
  let created=false;
  await assert.rejects(qualifyCapacity({isSessionValid:()=>false,EufyMega:class{constructor(){created=true;}}},{},{}));
  assert.equal(created,false);
});

for(const [limit,stall,refuse] of [[4,false,false],[5,false,false],[5,true,false],[4,false,true]]) test(`measures ${limit} calls (stall=${stall},refuse=${refuse}) and releases all consumers without password login`,async()=>{
  const active=new Set();const tickers=new Map();let closed=false,passed;
  const cameras=Array.from({length:5},(_,i)=>({sn:`T8000P000000000${i}`,model:i<2?'T8E00':'T8P00',stationSn:'synthetic-hub'}));
  const sdk={isSessionValid:()=>true,MemorySessionStore:class{save(){}},LoginStatus:{Ok:'ok'},EufyMega:class{
    constructor(o){passed=o;}on(){}async login(){return{status:'ok',session:{raw:{restored:true}}};}
    async getDevices(){return[{sn:'synthetic-hub',model:'T8N00'},...cameras];}
    async getDevice(sn){return{camera:()=>({live:async()=>{
      const consumer=new EventEmitter();let ticker;
      consumer.stop=()=>{clearInterval(ticker);active.delete(consumer);};
      if(active.size<limit){if(stall&&active.size===4)clearInterval(tickers.get([...active][0]));active.add(consumer);ticker=setInterval(()=>{
        consumer.emit('video',{codec:'h265',width:1920,height:1080});consumer.emit('audio',{});
      },1);tickers.set(consumer,ticker);}else if(refuse)setImmediate(()=>consumer.emit('error',Object.assign(new Error('PRIVATE',{cause:new Error('RTC PRIVATE scall answered 486')}),{name:'LiveStreamStartError',reason:'source-error',stage:'awaiting-first-frame'})));
      return consumer;
    }})};}
    async disconnect(){closed=true;}
  }};
  const report=await qualifyCapacity(sdk,{}, {email:'synthetic',password:'must-not-pass'}, {firstFrameMs:100,releaseMs:1,settleMs:20});
  assert.equal(report.status,stall?'failed':limit===4?'four_call_limit_observed':'five_streams_observed');
  assert.equal(active.size,0);assert.equal(closed,true);assert.equal(passed.password,undefined);
  assert.equal(report.runs.length,limit===4?6:5);
  assert.ok(report.runs.at(-1).frames>1);
  if(limit===4){if(refuse)assert.equal(report.runs[4].failure.cause.status,486);else assert.equal(report.runs[4].harnessDeadline,true);}
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
});

test('pending fifth call can start after releasing a consumer without opening a sixth',async()=>{
  const active=new Set(),queued=[];let opens=0;
  const cameras=Array.from({length:5},(_,i)=>({sn:`synthetic-${i}`,model:i<2?'T8E00':'T8P00',stationSn:'hub'}));
  const sdk={isSessionValid:()=>true,MemorySessionStore:class{save(){}},LoginStatus:{Ok:'ok'},EufyMega:class{
    on(){} async login(){return {status:'ok',session:{raw:{restored:true}}};}
    async getDevices(){return [{sn:'hub',model:'T8N00'},...cameras];}
    async getDevice(){return {camera:()=>({live:async()=>{
      opens++;const c=new EventEmitter();let interval,stopped=false;
      const start=()=>{if(stopped)return;active.add(c);interval=setInterval(()=>{c.emit('video',{});c.emit('audio',{});},1);};
      c.stop=()=>{if(stopped)return;stopped=true;clearInterval(interval);active.delete(c);queued.shift()?.();};
      if(active.size<4)start();else queued.push(start);
      return c;
    }})};}
    async disconnect(){}
  }};
  const report=await qualifyCapacity(sdk,{}, {},{firstFrameMs:100,pendingReleaseMs:5,settleMs:20});
  assert.equal(report.status,'pending_call_started_after_release');assert.equal(opens,5);
  assert.equal(report.runs.length,5);assert.equal(report.pendingRelease.releasedCamera,1);
  assert.ok(report.runs[4].frames>1);assert.equal(active.size,0);
});
