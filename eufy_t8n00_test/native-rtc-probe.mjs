// Bounded public SDK migration comparison; no device identifiers or encoded media are retained.
// Created with Codex.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const mode=process.argv[2];
if(!['baseline','candidate'].includes(mode))throw Error('explicit qualification mode required');
const revisions={baseline:'91be47bc68fbf424121629172676a2662a339f0d',candidate:'3ac9b7411f6b5eb94be5cef5a1cf3ee825ee1eb6'};
const report={mode,source:revisions[mode],started:new Date().toISOString(),runs:[],scope:'Public SDK contract and bounded live packet/video decoder observations; no audio decode, hearing, physical lens identity or AV synchronization claim'};
const output=`/data/native-rtc-${mode}-20261125.json`;
let client;const held=new Set(),children=new Set();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function save(){fs.writeFileSync(output,JSON.stringify(report,null,2),{mode:0o600});}
const deadline=setTimeout(()=>{report.status='deadline';save();for(const h of held)h.stop();for(const p of children)p.kill('SIGKILL');process.exit(1);},160000);
try{
  const sdk=await import(`/sdks/${mode}/dist/index.js`);
  const saved=JSON.parse(fs.readFileSync('/data/.eufy-session.json','utf8'));
  report.cachedSessionAccepted=sdk.isSessionValid(saved);
  report.cachedAccountIdPresent=typeof saved.accountUserId==='string'&&saved.accountUserId.length>0;
  if(!report.cachedSessionAccepted){report.status='fresh_login_required';save();}
  else{
    const options=JSON.parse(fs.readFileSync('/data/options.json','utf8'));
    const store=new sdk.MemorySessionStore();store.save(structuredClone(saved));
    client=new sdk.EufyMega({email:options.email,countryCode:options.country,store,autoRealtime:false,pollMs:0,storedSnapshotCache:false,logger:{debug(){},info(){},warn(){},error(){}}});
    client.on('error',()=>{});
    const login=await client.login();
    if(login.status!==sdk.LoginStatus.Ok||login.session?.raw?.restored!==true)throw Error('cached_session_not_restored');
    const inventory=await client.getDevices();
    const hubs=inventory.filter(d=>d.model==='T8N00');
    if(hubs.length!==1)throw Error('expected_one_nvr');
    const attached=inventory.filter(d=>d.stationSn===hubs[0].sn).sort((a,b)=>a.sn.localeCompare(b.sn));
    const targets=['T8E00','T8P00'].map(model=>attached.find(d=>d.model===model));
    if(targets.some(d=>!d))throw Error('expected_s4_and_e40');
    for(const target of targets){
      const camera=(await client.getDevice(target.sn)).camera();
      const run={model:target.model,viewsMethod:typeof camera?.views==='function',outputResolutionsMethod:typeof camera?.outputResolutions==='function',views:camera?.views?.(),outputs:camera?.outputResolutions?.(),videoPackets:0,audioPackets:0,audioCodecs:[],decodedVideoFrames:0,decodedGeometry:[],firstVideoMs:null,firstAudioMs:null};
      report.runs.push(run);save();
      const start=performance.now();let decoder,log='',finished=false,lastAudio;
      const gaps=[];let resolveReady;
      const ready=new Promise(r=>{resolveReady=r;});
      const h=await camera.live();held.add(h);
      const onError=()=>{run.streamError=true;resolveReady(false);};h.on('error',onError);
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
        run.maxAudioArrivalGapMs=Math.round(Math.max(0,...gaps));run.completed=new Date().toISOString();save();
      }
      await pause(10000);
    }
    report.status=report.runs.every(r=>r.videoPackets>0&&r.decodedVideoFrames>0)?'video_observed':'media_failed';
  }
}catch(error){
  report.status='failed';
  report.errorType=error?.constructor?.name??'Error';
  const safe=['cached_session_not_restored','expected_one_nvr','expected_s4_and_e40'];
  if(safe.includes(error.message))report.reason=error.message;
}finally{
  clearTimeout(deadline);for(const h of held)h.stop();for(const p of children)p.kill('SIGKILL');
  if(client)await client.disconnect().catch(()=>{});
  report.finished=new Date().toISOString();save();console.log('[native-rtc-qualification] '+JSON.stringify(report));
}
process.exit(0);
