// Bounded public SDK migration comparison; no device identifiers or encoded media are retained.
// Created with Codex.
import fs from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {opusOgg} from './opus-ogg.mjs';
const mode=process.argv[2];
const phase=process.argv[3]??'previous';
if(!['baseline','candidate'].includes(mode))throw Error('explicit qualification mode required');
const revisions={baseline:'91be47bc68fbf424121629172676a2662a339f0d',candidate:'bbc529ac9fbdacdae80c7f70c97555531ba67941'};
const persisted=['persistCold','persistRestored','persistPair'].includes(phase);
const fresh=mode==='candidate'&&(!persisted||phase==='persistCold');
const sessionFile='/data/rtc-bbc529ac/session.json';
const signals=[];
const report={phase,fresh,persisted,signals,mode,source:revisions[mode],started:new Date().toISOString(),runs:[],scope:'Default camera.live(), decoded video and Opus PCM; no hearing, optics, sync or concurrency verification'};
const output=`/data/native-rtc-${mode}-${phase}-diagnostic.json`;
let client;const held=new Set(),children=new Set();
const safeError=e=>String(e?.message??e).replace(/https?:\/\/\S+/g,'[endpoint]').replace(/\bT[A-Z0-9]{12,}\b/g,'[device]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[address]').slice(0,350);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function save(){fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});}
const deadline=setTimeout(()=>{report.status='deadline';save();console.log('[native-rtc-qualification] '+JSON.stringify(report));for(const h of held)h.stop();for(const p of children)p.kill('SIGKILL');process.exit(1);},160000);
try{
  const sdk=await import(`/sdks/${mode}/dist/index.js`);
  if(mode==='baseline'){
    const {createRequire}=await import('node:module');
    const require=createRequire('/sdks/baseline/package.json');
    try{require('node-datachannel');report.nativeDependencyLoaded=true;}catch(error){report.nativeDependencyLoaded=false;report.nativeDependencyError=safeError(error);}
  }
  const saved=fresh?null:JSON.parse(fs.readFileSync(persisted?sessionFile:'/data/.eufy-session.json','utf8'));
  report.cachedSessionAccepted=saved!==null&&sdk.isSessionValid(saved);
  report.cachedAccountIdPresent=typeof saved?.accountUserId==='string'&&saved.accountUserId.length>0;
  if(!fresh&&!report.cachedSessionAccepted){report.status='fresh_login_required';save();}
  else{
    const options=JSON.parse(fs.readFileSync('/data/options.json','utf8'));
    if(phase==='persistCold')fs.mkdirSync('/data/rtc-bbc529ac',{mode:0o700});
    const store=persisted?new sdk.FileSessionStore(sessionFile):new sdk.MemorySessionStore();
    if(!fresh&&!persisted)store.save(structuredClone(saved));
    client=new sdk.EufyMega({email:options.email,...(fresh?{password:options.password}:{}),countryCode:options.country,store,autoRealtime:false,sessionPerCamera:phase==='persistPair',pollMs:0,storedSnapshotCache:false,logger:{debug(message){if(mode==='candidate'&&typeof message==='string'&&message.startsWith('[rtc-signal] ')&&signals.length<160)signals.push(safeError(message));},info(){},warn(){},error(){}}});
    client.on('error',()=>{});
    const login=await client.login();
    report.loginStatus=login.status;
    report.loginRestored=login.session?.raw?.restored===true;
    if(login.status!==sdk.LoginStatus.Ok||report.loginRestored===fresh)throw Error(fresh?'fresh_login_failed':'cached_session_not_restored');
    const inventory=await client.getDevices();
    const hubs=inventory.filter(d=>d.model==='T8N00');
    if(hubs.length!==1)throw Error('expected_one_nvr');
    const attached=inventory.filter(d=>d.stationSn===hubs[0].sn).sort((a,b)=>a.sn.localeCompare(b.sn));
    const models=persisted?(phase==='persistPair'?['T8P00','T8E00']:['T8P00']):phase==='warm'?['T8P00','T8P00']:phase==='cold'||phase==='hostCold'?['T8P00']:['T8E00','T8P00'];
    const targets=models.map(model=>attached.find(d=>d.model===model));
    if(targets.some(d=>!d))throw Error('camera_missing');
    const measure=async target=>{
      const camera=(await client.getDevice(target.sn)).camera();
      const run={attempt:report.runs.length+1,signalIndex:signals.length,model:target.model,viewsMethod:typeof camera?.views==='function',outputResolutionsMethod:typeof camera?.outputResolutions==='function',views:camera?.views?.(),outputs:camera?.outputResolutions?.(),videoPackets:0,audioPackets:0,audioCodecs:[],decodedVideoFrames:0,decodedGeometry:[],firstVideoMs:null,firstAudioMs:null};
      report.runs.push(run);save();
      run.started=new Date().toISOString();
      const start=performance.now();let decoder,log='',finished=false,lastAudio;
      const gaps=[], opus=[];let resolveReady;
      const ready=new Promise(r=>{resolveReady=r;});
      let h;
      try{h=await camera.live();}catch(error){
        run.openError=safeError(error);run.completed=new Date().toISOString();save();
        if(phase==='warm'&&run.attempt===1){
          const limit=Date.now()+35000;
          while(!signals.some(line=>line.includes('heard REG 200'))&&Date.now()<limit)await pause(500);
        }
        return;
      }
      held.add(h);
      const onError=error=>{run.streamError=true;run.streamErrorMessage=safeError(error);resolveReady(false);};h.on('error',onError);
      h.on('video',frame=>{
        run.videoPackets++;run.firstVideoMs??=Math.round(performance.now()-start);resolveReady(true);
        if(!decoder&&['h264','h265'].includes(frame.codec)){
          decoder=spawn('ffmpeg',['-hide_banner','-nostdin','-f',frame.codec==='h265'?'hevc':'h264','-i','pipe:0','-vf','showinfo','-f','null','-'],{stdio:['pipe','ignore','pipe']});
          children.add(decoder);decoder.stdin.on('error',()=>{});
          decoder.stderr.on('data',data=>{log+=data;});
          decoder.on('error',()=>{run.decoderStartFailed=true;});
        }
        if(decoder?.stdin.writable&&!finished)decoder.stdin.write(frame.data);
      });
      h.on('audio',frame=>{
        const now=performance.now();run.audioPackets++;run.firstAudioMs??=Math.round(now-start);
        if(!run.audioCodecs.includes(frame.codec))run.audioCodecs.push(frame.codec);
        if(frame.codec==='opus'&&frame.data.length>0&&frame.data.length<8192&&opus.length<3000)opus.push(Buffer.from(frame.data));
        if(lastAudio!==undefined)gaps.push(now-lastAudio);lastAudio=now;
      });
      const first=setTimeout(()=>resolveReady(false),30000);
      try{const arrived=await ready;clearTimeout(first);if(arrived)await pause(15000);else run.firstVideoTimeout=true;}
      finally{
        clearTimeout(first);finished=true;h.stop();held.delete(h);
        if(decoder){
          const closed=new Promise(r=>decoder.once('close',code=>{run.videoDecoderExit=code;r();}));
          decoder.stdin.end();await Promise.race([closed,pause(5000)]);if(decoder.exitCode===null){decoder.kill('SIGKILL');await closed;}children.delete(decoder);
          const frames=[...log.matchAll(/Parsed_showinfo[^\n]*\bn:\s*\d+[^\n]*\bs:(\d+x\d+)/g)];
          run.decodedVideoFrames=frames.length;run.decodedGeometry=[...new Set(frames.map(m=>m[1]))];
        }
        if(opus.length){
          const pcm=spawnSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-f','ogg','-i','pipe:0','-ac','1','-ar','48000','-f','s16le','pipe:1'],{input:opusOgg(opus),timeout:10000,maxBuffer:8*1024*1024});
          run.audioDecoderExit=pcm.status;
          run.decodedAudioSamples=(pcm.stdout?.length??0)/2;
          run.audioDecoderReportedErrors=Boolean(pcm.stderr?.length||pcm.error);
        }
        run.maxAudioArrivalGapMs=Math.round(Math.max(0,...gaps));run.completed=new Date().toISOString();save();
      }
    };
    if(phase==='persistPair')await Promise.all(targets.map(measure));
    else for(const [index,target] of targets.entries()){if(index)await pause(10000);await measure(target);}
    report.status=report.runs.every(r=>r.decodedVideoFrames>0)?'video_observed':'media_failed';
  }
}catch(error){
  report.status='failed';
  report.errorType=error?.constructor?.name??'Error';
  report.errorMessage=safeError(error);
  const safe=['cached_session_not_restored','expected_one_nvr','expected_s4_and_e40'];
  if(safe.includes(error.message))report.reason=error.message;
}finally{
  clearTimeout(deadline);for(const h of held)h.stop();for(const p of children)p.kill('SIGKILL');
  if(client)await client.disconnect().catch(()=>{});
  report.sessionFileExists=persisted&&fs.existsSync(sessionFile);
  report.finished=new Date().toISOString();save();console.log('[native-rtc-qualification] '+JSON.stringify(report));
}
process.exit(0);
