// Bounded media-only diagnostic: never writes a camera setting. Created with Codex.
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import * as sdk from '/app/node_modules/@mega-yfue/eufy-sdk/dist/index.js';
import {selectCamera} from './select-camera.mjs';

const reportPath='/data/profile-probe-0.3.56.json';
if(existsSync(reportPath)){console.info('[profile-probe] Already attempted; refusing repeated hardware run.');process.exit(0);}
const report={artifact:'0.3.56',sdk:JSON.parse(await fs.readFile('/profile-probe-sdk.json','utf8')),started:new Date().toISOString(),cases:[]};
let client,consumer;
const save=()=>fs.writeFile(reportPath,JSON.stringify(report,null,2),{mode:0o600});
const deadline=setTimeout(()=>{report.status='deadline';consumer?.stop();void save().finally(()=>process.exit(1));},360000);
const logger={debug(){},info(){},warn(){},error(){}};
async function measure(camera,label,view,request1080) {
 process.env.EUFY_PROBE_1080=request1080===true?'1':'0';
 process.env.EUFY_PROBE_4K=request1080===3840?'1':'0';
 const m={label,view,requestedWidth:request1080===true?1920:request1080===3840?3840:null,frames:0,audioFrames:0,bytes:0,geometry:{},firstFrameMs:null};
 const started=performance.now();const chunks=[];let lastError=false;
 consumer=await camera.live({view});
 consumer.on('error',()=>{lastError=true;});
 consumer.on('audio',()=>m.audioFrames++);
 let firstResolve;const first=new Promise(r=>firstResolve=r);
 consumer.on('video',f=>{
  m.frames++;m.bytes+=f.data.length;m.firstFrameMs??=Math.round(performance.now()-started);
  const g=`${f.width}x${f.height}`;m.geometry[g]=(m.geometry[g]??0)+1;
  if(m.bytes<32*1024*1024)chunks.push(Buffer.from(f.data));firstResolve();
 });
 let firstTimeout;await Promise.race([first,new Promise(r=>firstTimeout=setTimeout(r,45000))]);clearTimeout(firstTimeout);
 if(m.frames)await delay(10000);
 consumer.stop();consumer=undefined;m.error=lastError;m.elapsedMs=Math.round(performance.now()-started);
 if(chunks.length){
  const file=`/tmp/profile-${label}.h265`;await fs.writeFile(file,Buffer.concat(chunks));
  const p=spawn('ffprobe',['-v','error','-f','hevc','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames','-of','json',file],{stdio:['ignore','pipe','pipe']});
  let out='';p.stdout.on('data',c=>out+=c);p.stderr.on('data',()=>{});
  const timer=setTimeout(()=>p.kill('SIGKILL'),20000);
  const code=await new Promise(r=>{p.once('error',()=>r(-1));p.once('close',r);});clearTimeout(timer);
  m.decoderExit=code;try{m.decoded=JSON.parse(out).streams;}catch{m.decodeJsonError=true;}
  const decoder=spawn('ffmpeg',['-hide_banner','-nostdin','-loglevel','info','-f','hevc','-i',file,'-an','-vf','showinfo','-f','null','-'],{stdio:['ignore','ignore','pipe']});
  let detail='';decoder.stderr.on('data',c=>detail+=c);
  const decoderTimer=setTimeout(()=>decoder.kill('SIGKILL'),20000);
  m.frameDecoderExit=await new Promise(r=>{decoder.once('error',()=>r(-1));decoder.once('close',r);});clearTimeout(decoderTimer);
  m.decodedFrameGeometry={};
  for(const match of detail.matchAll(/\bs:(\d+x\d+)\b/g))m.decodedFrameGeometry[match[1]]=(m.decodedFrameGeometry[match[1]]??0)+1;
  await fs.unlink(file);
 }
 report.cases.push(m);await save();console.info('[profile-probe] '+JSON.stringify(m));await delay(6000);
}
try{
 await save();
 const options=JSON.parse(await fs.readFile('/data/options.json','utf8'));
 const saved=JSON.parse(await fs.readFile('/data/.eufy-session.json','utf8'));
 if(!sdk.isSessionValid(saved))throw new Error('cached session not valid');
 const store=new sdk.MemorySessionStore();store.save(structuredClone(saved));
 client=new sdk.EufyMega({email:options.email,password:options.password,countryCode:options.country,store,autoRealtime:false,pollMs:0,storedSnapshotCache:false,logger});
 client.on('error',()=>{});
 const login=await client.login();if(login.status!==sdk.LoginStatus.Ok||login.session?.raw?.restored!==true)throw new Error('session not restored');
 report.restored=true;
 const {camera,model}=await selectCamera(client,s=>report.stage=s,options.qualify_profile_target);report.model=model;report.stage='view-inventory';report.views=camera.views();
 report.stage='media-measurement';
 for(const view of [0,1]){
  for(const [label,request] of [['native-a',false],['fullhd-a',true],['native-b',false],['fullhd-b',true]]){
   await measure(camera,`${label}-view${view}`,view,request);
  }
 }
 report.status='complete';
}catch(e){report.status='failed';report.failureType=e.name;report.failure=String(e.message).replace(/https?:\/\/\S+/g,'[url]').replace(/T[A-Z0-9]{10,}/g,'[device]').replace(/[\w.+-]+@[\w.-]+\.\w+/g,'[email]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[address]').slice(0,240);}
finally{consumer?.stop();await client?.disconnect();clearTimeout(deadline);report.finished=new Date().toISOString();await save();console.info('[profile-probe-result] '+JSON.stringify(report));}
