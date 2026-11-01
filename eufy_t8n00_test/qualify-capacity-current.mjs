// My bounded native-call capacity comparison against unmodified official SDK source. Created with Codex.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const REVISION='4f5d73f38e8bd62e74c1410ab510844a8b099307';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function qualifyCapacity(sdk,saved,options,{firstFrameMs=20000,releaseMs=9000,settleMs=8000}={}) {
  if (!sdk.isSessionValid(saved)) throw new Error('cached_session_unusable');
  const store=new sdk.MemorySessionStore(); store.save(structuredClone(saved));
  const client=new sdk.EufyMega({email:options.email,countryCode:options.country,store,
    autoRealtime:false,pollMs:0,storedSnapshotCache:false,logger:{debug(){},info(){},warn(){},error(){}}});
  client.on('error',()=>{});
  const report={revision:REVISION,sdkSource:true,testBridgeVersion:'0.3.46',nodeVersion:process.version,runs:[],status:'started'};
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
      const camera=(await client.getDevice(target.sn)).camera();
      const start=performance.now();
      const consumer=await camera.live();
      let finish;
      const ready=new Promise(resolve=>{finish=resolve;});
      const timer=setTimeout(()=>finish(false),firstFrameMs);
      const onVideo=frame=>{
        run.frames++; run.codec=frame.codec; run.width=frame.width; run.height=frame.height;
        if(run.firstVideoMs===null){run.firstVideoMs=Math.round(performance.now()-start);finish(true);}
      };
      consumer.on('video',onVideo);
      consumer.on('audio',()=>run.audioFrames++);
      consumer.on('error',()=>{run.streamFailed=true;finish(false);});
      const handle={consumer,run}; held.push(handle);
      await ready; clearTimeout(timer);
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
      report.observation = await observe(held);
      report.status=report.observation.every(r=>r.video>1)&&held.every(h=>!h.run.streamFailed)?'five_streams_observed':'failed';
    } else {
      fifth.consumer.stop(); held[0].consumer.stop();
      await pause(releaseMs);
      const retry=await open(4,'fifth_after_release');
      const remaining=[...held.slice(1,4),retry];
      report.observation=await observe(remaining);
      report.status=report.observation.every(r=>r.video>1)&&remaining.every(h=>!h.run.streamFailed)
        ?'four_call_limit_observed':'failed';
    }
    report.limits='Unmodified official SDK source 4f5d73f, primary views only; firmware not re-read. Public live video/audio packet counts; decoding, visual identity and browser playback not checked. Observed capacity belongs to this tested route, not a universal hardware claim.';
    return report;
  } catch {report.status='failed';report.reason='capacity_sequence_failed';return report;} finally {for(const h of held) h.consumer.stop(); await client.disconnect();}
}

export async function main() {
  const options=JSON.parse(readFileSync('/data/options.json','utf8'));
  if(options.qualify_nvr_capacity_current!==true) return;
  const path='/data/qualification-capacity-4f5d73f-current.json';
  if(existsSync(path)){console.info('[capacity-current-qualification] Exact current-source test already attempted; skipping.');return;}
  let report={revision:REVISION,status:'started',timestamp:new Date().toISOString()};
  const save=()=>writeFileSync(path,JSON.stringify(report,null,2),{mode:0o600});save();
  const timer=setTimeout(()=>{report.status='timeout';save();console.info('[capacity-current-qualification] '+JSON.stringify(report));process.exit(1);},180000);
  try {
    const sdk=await import('/view-qualification/bridge/node_modules/@mega-yfue/eufy-sdk/dist/index.js');
    const saved=JSON.parse(readFileSync('/data/.eufy-session.json','utf8'));
    report={...report,...await qualifyCapacity(sdk,saved,options)};
  } catch {report.status='failed';report.reason='qualification_failed_without_sensitive_details';}
  finally {clearTimeout(timer);save();console.info('[capacity-current-qualification] '+JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await main();process.exit(0);}
