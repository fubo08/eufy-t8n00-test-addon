// My qualification safety checks. Created with Codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualify, measure } from './qualify-media.mjs';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';

test('an invalid cached session cannot start a client', async () => {
  let created = false;
  const sdk = { isSessionValid:()=>false, EufyMega:class { constructor(){created=true;} } };
  await assert.rejects(qualify(sdk,{}, {},{},()=>{}));
  assert.equal(created,false);
});

test('no password is passed and a non-restored login closes before discovery', async () => {
  let opts, closed=false;
  const sdk={ isSessionValid:()=>true, MemorySessionStore:class {save(){}}, LoginStatus:{Ok:'ok'},
    EufyMega:class { constructor(o){opts=o;} on(){} async login(){return {status:'ok',session:{raw:{restored:false}}};}
      async getDevices(){throw new Error('must not discover');} async disconnect(){closed=true;} } };
  await assert.rejects(qualify(sdk,{}, {email:'synthetic',password:'must-not-pass'}, {},()=>{}),/cached_session_not_restored/);
  assert.equal(opts.password,undefined); assert.equal(closed,true);
});

test('an early stream end is not mistaken for a completed measurement', async () => {
  const consumer = new EventEmitter();
  consumer.pause=()=>{};consumer.resume=()=>{};consumer.stop=()=>{};
  const client={getDevice:async()=>({camera:()=>({live:async()=>{
    setTimeout(()=>consumer.emit('stop'),10);return consumer;
  }})})};
  const report=await measure(client,{sn:'synthetic',model:'T8P00'},1000);
  assert.equal(report.earlyStop,true); assert.equal(report.validVideo,false);
});

test('real decoder accepts generated H264 and reports decoded frames', async () => {
  const generated=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=64x64:rate=10',
    '-t','1','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-f','h264','pipe:1']);
  assert.equal(generated.status,0,'FFmpeg fixture generation must succeed');
  const consumer=new EventEmitter();
  consumer.pause=()=>{};consumer.resume=()=>{};consumer.stop=()=>{};
  const client={getDevice:async()=>({camera:()=>({live:async()=>{
    setTimeout(()=>{
      consumer.emit('audio',{codec:'g711a',data:Buffer.from([0]),timestampMs:1});
      consumer.emit('video',{codec:'h264',data:generated.stdout,timestampMs:1,width:64,height:64});
    },10);return consumer;
  }})})};
  const report=await measure(client,{sn:'synthetic',model:'T8P00'},1000);
  assert.equal(report.earlyStop,false);
  assert.equal(report.validVideo,true); assert.equal(report.decodedFrames,10);
  assert.equal(report.audioFrames,1);
});
