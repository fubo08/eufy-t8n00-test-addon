// Bounded media-only diagnostic: never writes a camera setting. Created with Codex.
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import * as sdk from '/app/node_modules/@mega-yfue/eufy-sdk/dist/index.js';
import {selectCamera} from './select-camera.mjs';

const reportPath='/data/profile-probe-0.3.55.json';
if(existsSync(reportPath)){console.info('[profile-probe] Already attempted; refusing repeated hardware run.');process.exit(0);}
const report={artifact:'0.3.55',sdk:JSON.parse(await fs.readFile('/profile-probe-sdk.json','utf8')),started:new Date().toISOString(),cases:[]};
let client,consumer;
const save=()=>fs.writeFile(reportPath,JSON.stringify(report,null,2),{mode:0o600});
const deadline=setTimeout(()=>{report.status='deadline';consumer?.stop();void save().finally(()=>process.exit(1));},240000);
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
 const {camera,model}=await selectCamera(client,s=>report.stage=s);report.model=model;report.stage='view-inventory';report.views=camera.views();
 report.stage='media-measurement';
 await measure(camera,'request4k-fixed',0,3840);
 await measure(camera,'request1080-fixed',0,true);
 await measure(camera,'request4k-movable',1,3840);
 await measure(camera,'request1080-movable',1,true);
 await measure(camera,'native-after',0,false);
 report.status='complete';
}catch(e){report.status='failed';report.failureType=e.name;report.failure=String(e.message).replace(/https?:\/\/\S+/g,'[url]').replace(/T[A-Z0-9]{10,}/g,'[device]').replace(/[\w.+-]+@[\w.-]+\.\w+/g,'[email]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[address]').slice(0,240);}
finally{consumer?.stop();await client?.disconnect();clearTimeout(deadline);report.finished=new Date().toISOString();await save();console.info('[profile-probe-result] '+JSON.stringify(report));}
