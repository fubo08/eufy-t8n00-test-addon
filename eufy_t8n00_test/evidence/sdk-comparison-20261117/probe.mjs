// Local-only measurements; no media or private inventory is published. Created with Codex.
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const label=process.argv[2];
if(!['stable','beta35','beta63'].includes(label))throw Error('label required');
const host=process.env.EUFY_BRIDGE_HOST;
if(!host)throw Error('EUFY_BRIDGE_HOST required');
const report={label,started:new Date().toISOString(),cases:[]};
const reportUrl=new URL(`./sdk-compare-${label}-20261117.json`,import.meta.url);
const ffmpeg=fileURLToPath(new URL('./rtsp-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe',import.meta.url));
const save=()=>fs.writeFile(reportUrl,JSON.stringify(report,null,2));
const ws=new WebSocket(`ws://${host}:3000/ws`);const pending=new Map();let seq=0;
ws.addEventListener('message',event=>{const d=JSON.parse(event.data);pending.get(d.id)?.(d)});
await Promise.race([new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})}),delay(15000).then(()=>{throw Error('WS unavailable')})]);
function command(cmd,args={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('command timeout'))},60000);pending.set(id,d=>{clearTimeout(timer);pending.delete(id);resolve(d)});ws.send(JSON.stringify({id,cmd,...args}))})}
async function decode(source,seconds){return new Promise(resolve=>{
 const start=performance.now();let log='',firstFrameSeconds;
 const child=spawn(ffmpeg,['-hide_banner','-nostdin','-loglevel','info','-rtsp_transport','tcp','-timeout','20000000','-i',`rtsp://${host}:8554/${source}`,'-map','0:v:0','-an','-vf','showinfo','-t',String(seconds),'-f','null','-'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 child.stderr.on('data',data=>{log+=data;if(firstFrameSeconds===undefined&&/\bn:\s*0\s+pts:/.test(log))firstFrameSeconds=+( (performance.now()-start)/1000).toFixed(3)});
 const timer=setTimeout(()=>child.kill(),90000);
 child.on('error',()=>{});
 child.on('close',exit=>{clearTimeout(timer);const geometry={};for(const m of log.matchAll(/\bs:(\d+x\d+)\b/g))geometry[m[1]]=(geometry[m[1]]??0)+1;const ts=[...log.matchAll(/pts_time:([\d.-]+)/g)].map(m=>Number(m[1]));const diffs=ts.slice(1).map((t,i)=>t-ts[i]);resolve({exit,firstFrameSeconds,elapsedSeconds:+((performance.now()-start)/1000).toFixed(3),codec:log.match(/Video: ([a-z0-9]+)/)?.[1],geometry,decodedFrames:ts.length,backwardsPts:diffs.filter(x=>x<0).length,largestPtsGap:diffs.length?Math.max(...diffs):null,decoderErrors:(log.match(/Error while decoding|Invalid NAL|Could not find ref/g)||[]).length})});
})}
try{
 report.auth=(await command('auth.status')).auth?.state;if(report.auth!=='ok')throw Error('auth not ready');
 const inventory=await command('devices.list');await fs.writeFile(new URL(`./sdk-compare-${label}-inventory.private.json`,import.meta.url),JSON.stringify(inventory));
 const cameras=inventory.devices.filter(d=>['T8E00','T8P00'].includes(d.model));
 report.inventory=cameras.map((d,i)=>({camera:i+1,model:d.model,capabilities:d.capabilities,power:d.power,canReboot:d.canReboot,stateKeys:Object.keys(d.state??{}),views:d.views?.map(v=>({view:v.view,outputs:v.outputs?.map(x=>x.outputResolution)}))}));
 const baseline=JSON.parse(await fs.readFile(new URL('./sdk-compare-stable-inventory.private.json',import.meta.url)));
 const target=(model)=>cameras.find(d=>d.sn===baseline.devices.find(x=>x.model===model).sn);
 const s4=target('T8E00'),e40=target('T8P00');
 if(!s4||!e40)throw Error('fixed comparison cameras missing');
 for(const [device,view] of [[e40,0],[s4,0],[s4,1]]){
  const descriptor=device.views.find(v=>v.view===view);const m={model:device.model,view,output:'default',...await decode(descriptor.id,20)};report.cases.push(m);await save();console.log(JSON.stringify(m));await delay(10000);
 }
 if(label!=='stable'){
  for(const [device,view] of [[e40,0],[s4,0],[s4,1]]){
   const descriptor=device.views.find(v=>v.view===view)?.outputs?.find(x=>x.outputResolution==='1080p');
   const m={model:device.model,view,output:'1080p',advertised:!!descriptor,...(descriptor?await decode(descriptor.id,10):{})};report.cases.push(m);await save();console.log(JSON.stringify(m));await delay(10000);
  }
  const pair=await Promise.all(s4.views.map(async v=>({model:s4.model,view:v.view,output:'default',concurrent:true,...await decode(v.id,30)})));report.cases.push(...pair);await save();console.log(JSON.stringify({pair}));
  const response=await fetch(`http://${host}:3000/last-screen/${s4.sn}`);report.screenBefore={status:response.status,savedAt:response.headers.get('x-saved-at')};await response.arrayBuffer();
  const taken=await command('screen.take',{sn:s4.sn});const after=await fetch(`http://${host}:3000/last-screen/${s4.sn}`);const bytes=new Uint8Array(await after.arrayBuffer());report.screenAfter={ack:taken.ok,status:after.status,savedAt:after.headers.get('x-saved-at'),bytes:bytes.length,jpeg:bytes[0]===255&&bytes[1]===216};
 }
 report.status='complete';
}catch(e){report.status='failed';report.error=e.message.replace(/[A-Z0-9]{12,}/g,'[redacted]')}
finally{ws.close();report.finished=new Date().toISOString();await save();console.log(JSON.stringify({label,status:report.status}))}
