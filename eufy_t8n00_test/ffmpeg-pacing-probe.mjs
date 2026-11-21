// Content-based flash/beep comparison through the actual bridge HTTP + go2rtc + Opus path.
// All media is synthetic. Created with Codex.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(process.argv[2]??path.join(root,'bridge-audio-combined-20261121'));
const ffmpeg=process.env.SYNC_FFMPEG??path.join(root,'rtsp-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const go2rtc=process.env.SYNC_GO2RTC??path.join(root,'go2rtc-1.9.9/go2rtc.exe');
process.env.BRIDGE_STREAM_CONSUMER_LOG_MS='0';
const {loadConfig}=await import(pathToFileURL(path.join(source,'src/config.mjs')));
const {createState}=await import(pathToFileURL(path.join(source,'src/state.mjs')));
const {createHttpHandler}=await import(pathToFileURL(path.join(source,'src/http-routes.mjs')));
const {writeGo2rtcConfig}=await import(pathToFileURL(path.join(source,'go2rtc-config.mjs')));
const measured=JSON.parse(await fs.readFile(path.join(root,'audio-arrivals.json'),'utf8'));
const dir=await fs.mkdtemp(path.join(root,'audio-sync-tmp-'));
const children=new Set();
function start(bin,args){const p=spawn(bin,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(p);p.on('close',()=>children.delete(p));return p;}
async function run(bin,args,timeout=25000){const p=start(bin,args);let out='',log='',pending='';const audioArrivals=[];p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>{log+=d;pending+=d;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)if(line.includes('ashowinfo')&&line.includes('pts_time:'))audioArrivals.push(performance.now());});let timer;try{return await new Promise((resolve,reject)=>{timer=setTimeout(()=>{p.kill();reject(Error('media command deadline'));},timeout);p.on('error',reject);p.on('close',code=>resolve({code,out,log,audioArrivals}));});}finally{clearTimeout(timer);}}
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
function units(data){const cuts=[];for(let i=0;i+5<data.length;i++){let n=data[i]===0&&data[i+1]===0&&data[i+2]===1?3:data[i]===0&&data[i+1]===0&&data[i+2]===0&&data[i+3]===1?4:0;if(n){if(((data[i+n]>>1)&63)===35)cuts.push(i);i+=n-1;}}return cuts.map((at,i)=>data.subarray(at,cuts[i+1]??data.length));}
function aacUnits(data){const out=[];for(let p=0;p<data.length;){const n=((data[p+3]&3)<<11)|(data[p+4]<<3)|(data[p+5]>>5);if(n<7||p+n>data.length)throw Error('synthetic ADTS framing');out.push(data.subarray(p,p+n));p+=n;}return out;}
let server;
try{
  const videoFile=path.join(dir,'flash.h265'),audioFile=path.join(dir,'beep.aac');
  let r=await run(ffmpeg,['-hide_banner','-v','error','-f','lavfi','-i',"color=black:size=128x96:rate=15,drawbox=color=white:t=fill:enable='between(t,4,4.25)'",'-t','9','-c:v','libx265','-preset','ultrafast','-tune','zerolatency','-x265-params','aud=1:bframes=0:keyint=15:min-keyint=15:scenecut=0:repeat-headers=1:pools=1:frame-threads=1:log-level=error','-f','hevc',videoFile]);
  if(r.code!==0)throw Error('synthetic video: '+r.log.slice(-1000));
  r=await run(ffmpeg,['-hide_banner','-v','error','-f','lavfi','-i',"sine=frequency=1000:sample_rate=16000,volume=0:enable='not(between(t,4,4.25))'",'-t','9','-c:a','aac','-f','adts',audioFile]);
  if(r.code!==0)throw Error('synthetic audio: '+r.log.slice(-1000));
  const video=units(await fs.readFile(videoFile)),audio=aacUnits(await fs.readFile(audioFile));
  if(video.length!==135)throw Error('unexpected video access-unit count '+video.length);
  const results=[];
  for(const candidate of [false,true]){
    const bufferMs=0;
    const timers=[],feeds=new Set(),handles=new Set(),reports=[];let begun=false,g2;
    const config=loadConfig({EUFY_EMAIL:'synthetic@example.invalid',EUFY_PASSWORD:'synthetic',BRIDGE_AUDIO_BUFFER_MS:String(bufferMs),STREAM_INSTANT_START:'0',STREAM_OPEN_ATTEMPTS:'1'});
    Object.assign(config.cfg,{selfHost:'127.0.0.1',go2rtcRtspPort:await freePort(),go2rtcApiPort:await freePort(),go2rtcWebrtcPort:await freePort(),go2rtcConfig:path.join(dir,'go2rtc.yaml')});
    const state=createState();state.flags.ready=true;
    function begin(){if(begun)return;begun=true;
      video.forEach((data,n)=>timers.push(setTimeout(()=>{for(const f of feeds)if(!f.destroyed)f.write(data);},n*1000/15)));
      // Deterministic delivery bursts, preserving sample order and media content.
      audio.forEach((data,n)=>timers.push(setTimeout(()=>{for(const h of handles)h.emit('audio',{codec:'aac-lc',data});},measured.arrivalMs[n])));
      timers.push(setTimeout(()=>{for(const f of feeds)f.end();for(const h of handles)h.emit('stop');},9200));
    }
    const camera={views:()=>[0],openReadable:async()=>{const f=new PassThrough();feeds.add(f);f.once('close',()=>feeds.delete(f));f.write(video[0]);begin();return f;},live:async()=>{const h=new EventEmitter();handles.add(h);h.stop=()=>handles.delete(h);begin();return h;}};
    const device={camera:()=>camera,describe:()=>({sn:'SYNTHETIC',model:'T8E00',name:'Synthetic PoE Cam S4 flash/beep',category:'eufy_security',capabilities:['camera','video','ptz']})};
    const client={getDevice:async()=>device};
    const handler=createHttpHandler({...config,state,eventImageDir:dir,eventLog:line=>{if(line.startsWith('[audio-pacing]'))reports.push(JSON.parse(line.slice('[audio-pacing] '.length)));},broadcast(){},authStatus:()=>({state:'ok'}),streamClientFor:()=>Promise.resolve(client),noteStreamOpened(){},noteStreamFailure(){},dropStreamClient(){},streamBackoffMs:()=>0,go2rtcConsumerCount:async()=>1});
    server=http.createServer((req,res)=>void handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.cfg.port=server.address().port;
    await writeGo2rtcConfig(config.cfg,[{sn:'SYNTHETIC',model:'T8E00',stream:'/stream/SYNTHETIC'}]);
    let yaml=await fs.readFile(config.cfg.go2rtcConfig,'utf8');yaml=yaml.replaceAll('listen: ":','listen: "127.0.0.1:').replace('ffmpeg:\n','ffmpeg:\n  bin: '+JSON.stringify(ffmpeg.replaceAll('\\','/'))+'\n');await fs.writeFile(config.cfg.go2rtcConfig,yaml);
    // Compare the actual generated candidate against its unpaced form. Never inject the fix here.
    if(!candidate)yaml=yaml.replace('asetpts=N/SR/TB,adelay=384:all=1,arealtime,atrim=start=0.384,asetpts=N/SR/TB','asetpts=N/SR/TB').replace('asetpts=N/SR/TB,arealtime','asetpts=N/SR/TB');
    await fs.writeFile(config.cfg.go2rtcConfig,yaml);
    let g2log='';g2=start(go2rtc,['-config',config.cfg.go2rtcConfig]);g2.stdout.on('data',d=>g2log+=d);g2.stderr.on('data',d=>g2log+=d);
    try{
      let ready=false;for(let n=0;n<50;n++){try{const q=await fetch(`http://127.0.0.1:${config.cfg.go2rtcApiPort}/api/streams`);if(q.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}if(!ready)throw Error('go2rtc did not start: '+g2log.slice(-1000));
      const probe=await run(ffmpeg,['-hide_banner','-nostdin','-rtsp_transport','tcp','-analyzeduration','1000000','-probesize','262144','-i',`rtsp://127.0.0.1:${config.cfg.go2rtcRtspPort}/SYNTHETIC?video&audio=opus`,'-vf','blackdetect=d=0.05:pix_th=0.1:pic_th=0.98','-af','ashowinfo,silencedetect=noise=-40dB:d=0.05','-t','6','-f','null','-'],25000);
      const flash=Number(probe.log.match(/black_end:([\d.-]+)/)?.[1]??NaN);
      const beep=Number([...probe.log.matchAll(/silence_end:\s*([\d.-]+)/g)].map(m=>m[1]).find(t=>Number(t)>1)??NaN);
      const gaps=probe.audioArrivals.slice(1).map((t,i)=>t-probe.audioArrivals[i]);const item={candidate,audioFrames:probe.audioArrivals.length,maxArrivalGapMs:Math.round(Math.max(0,...gaps)),gapsOver100:gaps.filter(g=>g>100).length,bufferMs,exit:probe.code,flashPts:flash,beepPts:beep,beepMinusFlashMs:Math.round((beep-flash)*1000),reports};results.push(item);console.log(JSON.stringify(item));
      await fs.writeFile(path.join(root,`audio-ffmpeg-reserve-${candidate}-20261121.log`),probe.log+'\nGO2RTC\n'+g2log);
      if(!Number.isFinite(flash)||!Number.isFinite(beep))throw Error('flash/beep event not observed');
    }finally{for(const t of timers)clearTimeout(t);for(const f of feeds)f.destroy();for(const h of handles)h.stop();g2?.kill();server.closeAllConnections();await new Promise(r=>server.close(r));server=null;}
  }
  const result={scope:'Synthetic HEVC flash and AAC beep through production HTTP, generated go2rtc sources and RTSP Opus; not physical NVR synchronization or listening evidence',results,additionalAudioOffsetMs:results[1].beepMinusFlashMs-results[0].beepMinusFlashMs};
  if(results[1].maxArrivalGapMs>=results[0].maxArrivalGapMs*0.6)throw Error('audio reserve did not absorb my recorded S4 arrival gaps');
  if(results.some(r=>r.exit!==0||r.audioFrames<200)||Math.abs(result.additionalAudioOffsetMs)>150)throw Error('audio pacing comparison failed');
  await fs.writeFile(path.join(root,'audio-ffmpeg-reserve-comparison-20261121.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
  for(const p of children)p.kill();if(server){server.closeAllConnections();server.close();}
  const resolved=await fs.realpath(dir);if(path.dirname(resolved)!==root||!path.basename(resolved).startsWith('audio-sync-tmp-'))throw Error('unsafe cleanup path');await fs.rm(resolved,{recursive:true,force:true});
}

