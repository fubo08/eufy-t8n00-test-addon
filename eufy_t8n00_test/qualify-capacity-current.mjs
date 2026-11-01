// My bounded native-call capacity comparison against unmodified official SDK source. Created with Codex.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {failureMetadata,traceMetadata} from './capacity-diagnostics.mjs';
import {observeSessions} from './capacity-signaling.mjs';
export const REVISION='4f5d73f38e8bd62e74c1410ab510844a8b099307';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function qualifyCapacity(sdk,saved,options,{firstFrameMs=25000,releaseMs=9000,settleMs=8000,signalingMode,pendingReleaseMs,afterOpen}={}) {
  if (!sdk.isSessionValid(saved)) throw new Error('cached_session_unusable');
  const store=new sdk.MemorySessionStore(); store.save(structuredClone(saved));
  const report={revision:REVISION,sdkSource:true,testBridgeVersion:'0.3.49',nodeVersion:process.version,runs:[],status:'started'};
  report.trace=[];
  let window={phase:'login'};
  const began=performance.now();
  const log=(message)=>{const event=traceMetadata(message);if(event&&report.trace.length<150)report.trace.push({ms:Math.round(performance.now()-began),window:{...window},...event});};
  const client=new sdk.EufyMega({email:options.email,countryCode:options.country,store,
    autoRealtime:false,pollMs:0,storedSnapshotCache:false,logger:{debug:log,info(){},warn:log,error(){}}});
  client.on('error',()=>{});
  report.signaling=[];
  const restore=signalingMode?observeSessions(client,signalingMode,event=>{if(report.signaling.length<500)report.signaling.push({ms:Math.round(performance.now()-began),...event});}):()=>{};
  report.diagnosticMode=signalingMode??'sdk-default';
  const held=[];
  try {
    const login=await client.login();
    if (login.status!==sdk.LoginStatus.Ok || login.session?.raw?.restored!==true) throw new Error('cached_session_not_restored');
    const devices=await client.getDevices();
    const hubs=devices.filter(d=>d.model==='T8N00');
    if(hubs.length!==1) throw new Error('expected_one_nvr');
    const targets=devices.filter(d=>['T8E00','T8P00'].includes(d.model)&&d.stationSn===hubs[0].sn).sort((a,b)=>a.sn.localeCompare(b.sn));
    if(targets.length!==5) throw new Error('expected_five_cameras');
    async function open(index,phase) {
      const target=targets[index];
      const run={camera:index+1,model:target.model,view:0,phase,frames:0,audioFrames:0,firstVideoMs:null};
      report.runs.push(run);
      window={camera:index+1,phase};
      run.firstFrameDeadlineMs=firstFrameMs;
      const camera=(await client.getDevice(target.sn)).camera();
      const start=performance.now();
      const consumer=await camera.live();
      let finish;
      const ready=new Promise(resolve=>{finish=resolve;});
      const timer=setTimeout(()=>{run.harnessDeadline=true;finish(false);},firstFrameMs);
      const onVideo=frame=>{
        run.frames++; run.codec=frame.codec; run.width=frame.width; run.height=frame.height;
        if(run.firstVideoMs===null){run.firstVideoMs=Math.round(performance.now()-start);finish(true);}
      };
      consumer.on('video',onVideo);
      consumer.on('audio',()=>run.audioFrames++);
      consumer.on('error',error=>{run.streamFailed=true;run.failure=failureMetadata(error);run.errorAfterMs=Math.round(performance.now()-start);finish(false);});
      consumer.on('stop',()=>{run.stopObserved=true;if(!run.frames)finish(false);});
      const handle={consumer,run}; held.push(handle);
      let releaseTimer;
      if(index===4&&phase==='fifth_while_four_held'&&pendingReleaseMs!==undefined)releaseTimer=setTimeout(()=>{
        report.pendingRelease={requestedAfterMs:Math.round(performance.now()-start),releasedCamera:1};
        held[0].consumer.stop();
      },pendingReleaseMs);
      await ready; clearTimeout(timer);clearTimeout(releaseTimer);
      if(afterOpen)await afterOpen(run);
      return handle;
    }
    async function observe(handles) {
      const before=handles.map(h=>({video:h.run.frames,audio:h.run.audioFrames}));
      await pause(settleMs);
      return handles.map((h,i)=>({camera:h.run.camera,video:h.run.frames-before[i].video,audio:h.run.audioFrames-before[i].audio}));
    }
    report.observationMs=settleMs;
    for(let i=0;i<4;i++) {
      const h=await open(i,'first_four');
      if(!h.run.frames) throw new Error('first_four_not_all_streaming');
    }
    const fifth=await open(4,'fifth_while_four_held');
    if(fifth.run.frames) {
      const observing=pendingReleaseMs===undefined?held:held.slice(1);
      report.observation = await observe(observing);
      report.status=report.observation.every(r=>r.video>1)&&observing.every(h=>!h.run.streamFailed)?(pendingReleaseMs===undefined?'five_streams_observed':'pending_call_started_after_release'):'failed';
    } else {
      fifth.consumer.stop(); held[0].consumer.stop();
      await pause(releaseMs);
      const retry=await open(4,'fifth_after_release');
      const remaining=[...held.slice(1,4),retry];
      report.observation=await observe(remaining);
      report.status=report.observation.every(r=>r.video>1)&&remaining.every(h=>!h.run.streamFailed)
        ?'four_call_limit_observed':'failed';
    }
    report.limits='Unmodified official SDK source 4f5d73f, primary views only; firmware not re-read. Public live video/audio packet counts and allow-listed error metadata; trace windows do not identify individual peer sessions; decoding, visual identity and browser playback not checked. Observed capacity belongs to this tested route, not a universal hardware claim.';
    return report;
  } catch(error) {report.status='failed';report.reason='capacity_sequence_failed';report.failure=failureMetadata(error);return report;} finally {for(const h of held) h.consumer.stop(); await client.disconnect();restore();}
}

export async function main() {
  const options=JSON.parse(readFileSync('/data/options.json','utf8'));
  if(options.qualify_nvr_capacity_current!==true) return;
  const path='/data/qualification-capacity-4f5d73f-pending49.json';
  if(existsSync(path)){console.info('[capacity-current-qualification] Exact current-source test already attempted; skipping.');return;}
  let report={revision:REVISION,status:'started',timestamp:new Date().toISOString()};
  const save=()=>writeFileSync(path,JSON.stringify(report,null,2),{mode:0o600});save();
  const timer=setTimeout(()=>{report.status='timeout';save();console.info('[capacity-current-qualification] '+JSON.stringify(report));process.exit(1);},300000);
  try {
    const sdk=await import('/view-qualification/bridge/node_modules/@mega-yfue/eufy-sdk/dist/index.js');
    const saved=JSON.parse(readFileSync('/data/.eufy-session.json','utf8'));
    report.comparisons=[];
    for(const signalingMode of ['call']) {
      report.comparisons.push(await qualifyCapacity(sdk,saved,options,{signalingMode,pendingReleaseMs:1000}));
      await pause(12000);
    }
    report.status='pending_comparison_completed';
    report.instrumentation='Test-only internal session factory interception; SDK files unchanged. Mode explicitly overridden; peer ICE policy unchanged. No raw payload retained.';
  } catch {report.status='failed';report.reason='qualification_failed_without_sensitive_details';}
  finally {
    clearTimeout(timer);save();
    const compact={...report,comparisons:report.comparisons?.map(({trace,signaling,...c})=>({...c,
      signaling:signaling.filter(e=>e.session===5),
      sessionSummary:[...new Set(signaling.map(e=>e.session))].map(session=>{
        const events=signaling.filter(e=>e.session===session);
        return {session,rawCount:events.filter(e=>e.direction==='wire-in').length,parsedCount:events.filter(e=>e.direction==='in').length,
          statuses:events.filter(e=>e.direction==='in'&&e.status!==undefined).map(e=>({ms:e.ms,type:e.type,status:e.status})),
          offerMs:events.find(e=>e.direction==='wire-in'&&e.hasSdp)?.ms,
          sentCallMs:events.find(e=>e.direction==='out'&&e.type==='call')?.ms,
          closedMs:events.find(e=>e.direction==='closed')?.ms};
      })}))};
    console.info('[capacity-current-qualification] '+JSON.stringify(compact));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await main();process.exit(0);}
