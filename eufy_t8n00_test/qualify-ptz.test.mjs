// My qualification safety checks. Created with Codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualify } from './qualify-ptz.mjs';
function fixture({valid=true, ptz=true, ack=true, count=1}={}) {
 const observed={writes:[],closed:false};
 const sdk={isSessionValid:()=>valid,MemorySessionStore:class{save(s){observed.saved=s;}},LoginStatus:{Ok:'ok'},EufyMega:class{
  constructor(options){observed.options=options;} on(){}
  async login(){return {status:'ok',session:{raw:{restored:true}}};}
  async getDevices(){return [{model:'T8N00',sn:'synthetic'},...Array.from({length:count},(_,i)=>({model:'T8E00',sn:'camera'+i,stationSn:'synthetic'}))];}
  async getDevice(){return {ptz:()=>ptz?{async rotate(direction){observed.writes.push(direction); observed.options.logger.debug('[rtc] synthetic authenticated — call');if(ack)observed.options.logger.debug('[rtc] synthetic cmd 6030 acked');}}:undefined};}
  async disconnect(){observed.closed=true;}
 }};return {sdk,observed};
}
test('calls the public PTZ API and distinguishes ACKs from observation',async()=>{
 const {sdk,observed}=fixture(),saved={token:'synthetic'},report={};
 await qualify(sdk,saved,report,'synthetic@example.invalid');
 assert.deepEqual(observed.writes,['right','left']);assert.equal(report.command6030AckCount,2);
 assert.equal(report.status,'commands_acked');assert.equal(report.physicalMovement,'requires_independent_observation');
 assert.notEqual(observed.saved,saved);assert.equal(observed.options.password,undefined);assert.equal(observed.closed,true);
});
for(const options of [{ptz:false},{count:0},{count:2}])test('fails before movement on unavailable or ambiguous target '+JSON.stringify(options),async()=>{
 const {sdk,observed}=fixture(options);await assert.rejects(qualify(sdk,{},{}));assert.deepEqual(observed.writes,[]);assert.equal(observed.closed,true);
});
test('invalid session never constructs a client',async()=>{const {sdk,observed}=fixture({valid:false});await assert.rejects(qualify(sdk,{},{}));assert.equal(observed.options,undefined);});
test('missing ACK cannot pass',async()=>{const {sdk}=fixture({ack:false});const report={};await assert.rejects(qualify(sdk,{},report),/rtc_ack_evidence_missing/);assert.notEqual(report.status,'commands_acked');});
