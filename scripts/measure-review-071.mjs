// Bounded decoder / audio-route measurements; media stays in memory. Created with Codex.
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const profile=process.argv[2],artifact=process.argv[3];
if(!['fullhd78','registry05'].includes(profile)||!artifact)throw Error('profile/artifact required');
const host=process.env.QUALIFICATION_HOST;
if(!host||!process.env.FFMPEG_PATH)throw Error('QUALIFICATION_HOST and FFMPEG_PATH required');
const fullhd=profile==='fullhd78';
const report={profile,artifact,source:profile==='registry05'?'f00bcf74c0f3736e38841a69796afbe06f99688e':'a3459db2d271736b63acb674c9fd3d51872c4379',sdk:profile==='fullhd78'?'0.6.0-beta.78':'0.5.0',started:new Date().toISOString(),cases:[]};
const file=new URL(`./review-071-${profile}${process.argv[4]?'-'+process.argv[4]:''}-20261125.json`,import.meta.url);
const save=()=>fs.writeFile(file,JSON.stringify(report,null,2));
const binary=process.env.FFMPEG_PATH;
const pending=new Map();let seq=0;
const ws=new WebSocket(`ws://${host}:3000/ws`);
ws.addEventListener('message',e=>{const d=JSON.parse(e.data);pending.get(d.id)?.(d)});
await Promise.race([new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})}),delay(15000).then(()=>{throw Error('WS unavailable')})]);
function command(cmd,args={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('command timeout'))},60000);pending.set(id,d=>{clearTimeout(timer);pending.delete(id);resolve(d)});ws.send(JSON.stringify({id,cmd,...args}))})}
function stats(values){return{frames:values.length,backwardsPts:values.slice(1).filter((v,i)=>v<values[i]).length,maxPtsGap:values.length>1?Math.max(...values.slice(1).map((v,i)=>v-values[i])):null,ptsSpan:values.length?values.at(-1)-values[0]:null}}
async function decode(id,seconds,needAudio=true){return new Promise(resolve=>{
 const start=performance.now();let log='';
 const c=spawn(binary,['-hide_banner','-nostdin','-loglevel','info','-rtsp_transport','tcp','-timeout','20000000','-i',`rtsp://${host}:8554/${id}?video&audio=opus`,'-map','0:v:0','-map',needAudio?'0:a:0':'0:a:0?','-vf','showinfo','-af','ashowinfo','-t',String(seconds),'-f','null','-'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
 c.stderr.on('data',d=>log+=d);c.on('error',()=>{});const timer=setTimeout(()=>c.kill(),90000);
 c.on('close',exit=>{clearTimeout(timer);const lines=log.split('\n');const video=lines.filter(l=>/\[Parsed_showinfo_/.test(l)&&/\bn:\s*\d+/.test(l)),audio=lines.filter(l=>/\[Parsed_ashowinfo_/.test(l)&&/\bn:\s*\d+/.test(l));
 const pts=ls=>ls.flatMap(l=>[...l.matchAll(/pts_time:([\d.-]+)/g)].map(m=>Number(m[1])));
 const geometry={};for(const l of video){const v=l.match(/\bs:(\d+x\d+)\b/)?.[1];if(v)geometry[v]=(geometry[v]??0)+1;}
 const errors=lines.filter(l=>/Error while decoding|Invalid NAL|Could not find ref|Error opening input|Stream map .*matches no streams|DESCRIBE failed/.test(l)).map(l=>l.replaceAll(id,'[source]').replaceAll(host,'[host]').replace(/@ [0-9a-f]+/g,'@ [decoder]')).slice(0,8);
 resolve({exit,elapsedSeconds:+((performance.now()-start)/1000).toFixed(3),videoCodec:log.match(/Video: ([a-z0-9]+)/)?.[1],audioCodec:log.match(/Audio: ([a-z0-9_-]+)/)?.[1],geometry,video:stats(pts(video)),audio:stats(pts(audio)),errors});});
})}
async function audio(source){const start=performance.now(),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),25000);let reader;const result={};
 try{const response=await fetch(`http://${host}:3000${source.stream.replace(/^\/stream\//,'/audio/')}`,{signal:abort.signal});result.status=response.status;result.headersMs=+(performance.now()-start).toFixed(2);if(!response.ok)return result;
 reader=response.body.getReader();let data=Buffer.alloc(0),deadline=0;while(!deadline||performance.now()<deadline){const part=await reader.read();if(part.done)break;if(!deadline){result.firstByteMs=+(performance.now()-start).toFixed(2);deadline=performance.now()+4000;}data=Buffer.concat([data,part.value]);}
 result.bytes=data.length;result.formats=[];let frames=0;for(let p=0;p+7<=data.length;){if(data[p]!==255||(data[p+1]&0xf6)!==0xf0){p++;continue;}const len=((data[p+3]&3)<<11)|(data[p+4]<<3)|(data[p+5]>>5);if(len<7||p+len>data.length)break;const fmt={rateIndex:(data[p+2]>>2)&15,channels:((data[p+2]&1)<<2)|(data[p+3]>>6)};if(!result.formats.some(x=>x.rateIndex===fmt.rateIndex&&x.channels===fmt.channels))result.formats.push(fmt);frames++;p+=len;}result.frames=frames;
 }catch(e){result.errorType=e.name;}finally{clearTimeout(timer);await reader?.cancel().catch(()=>{});abort.abort();}return result;
}
async function record(item){report.cases.push(item);await save();console.log(JSON.stringify(item));}
try{
 let inventory;
 for(let attempt=0;attempt<60;attempt++){
  const auth=(await command('auth.status')).auth?.state;
  if(auth==='ok'){
   const candidate=await command('devices.list');
   if(candidate.devices?.some(d=>d.model==='T8E00')&&candidate.devices?.some(d=>d.model==='T8P00')){inventory=candidate;break;}
  }
  await delay(1000);
 }
 if(!inventory)throw Error('authenticated inventory unavailable');
 const s4=inventory.devices.find(d=>d.model==='T8E00'&&/carport|einfahrt/i.test(d.name))??inventory.devices.find(d=>d.model==='T8E00');
 const e40=inventory.devices.find(d=>d.model==='T8P00');
 const select=(d,v)=>{const item=d.views.find(x=>x.view===v);return fullhd?item.outputs?.find(x=>x.outputResolution==='1080p'):item;};
 if(process.argv[4]==='recovery-hold'){
  await record({kind:'registry-recovery-hold',model:s4.model,view:0,...await decode(select(s4,0).id,55)});
 }else{
  for(const[d,v]of[[s4,0],[s4,1],[e40,0]]){
   const source=select(d,v);
   await record({kind:'single',model:d.model,view:v,output:fullhd?'1080p':'native',...(source?await decode(source.id,15):{error:'output not advertised'})});
   await delay(9000);
  }
  const pair=await Promise.all([0,1].map(async view=>({kind:'parallel',model:s4.model,view,...await decode(select(s4,view).id,20)})));
  for(const p of pair)await record(p);
 }
 for(const seconds of[10,20,30]){
  await delay(10000);const h=await fetch(`http://${host}:3000/healthz`).then(r=>r.json());
  (report.release??=[]).push({seconds,streaming:h.streaming?.length});await save();
 }
 report.status='complete';
}catch(e){report.status='failed';report.errorType=e.name;}
finally{ws.close();report.finished=new Date().toISOString();await save();console.log(JSON.stringify({profile,status:report.status,release:report.release}));}