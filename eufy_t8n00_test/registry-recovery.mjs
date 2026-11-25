// Remove one idle optical registration, observe reconciliation, and restore it on any failed recovery.
// Created with Codex.
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire('/profiles/registry05/package.json');
const {parse}=require('yaml');
const config=parse(fs.readFileSync('/data/go2rtc.yaml','utf8'));
const report={source:'f00bcf74c0f3736e38841a69796afbe06f99688e',started:new Date().toISOString()};
const base='http://127.0.0.1:1984/api/streams';
async function get(){const r=await fetch(base,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('registry_read_failed');return r.json();}
let name,sources,removed=false;
try{
  const live=await get();
  name=Object.keys(live).find(n=>n.endsWith('_view_1')&&!(live[n].consumers?.length));
  if(!name)throw Error('no_idle_secondary_source');
  sources=config.streams[name];if(!Array.isArray(sources)||!sources.every(s=>typeof s==='string'))throw Error('saved_sources_unavailable');
  const r=await fetch(base+'?'+new URLSearchParams({src:name}),{method:'DELETE',signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw Error('delete_failed');removed=true;
  report.confirmedMissing=!Object.hasOwn(await get(),name);
  if(!report.confirmedMissing)throw Error('deletion_not_observed');
  const start=performance.now();
  while(performance.now()-start<45000){
    await new Promise(r=>setTimeout(r,1000));
    if(Object.hasOwn(await get(),name)){report.recoveredAfterMs=Math.round(performance.now()-start);report.status='recovered';break;}
  }
  report.status??='recovery_timeout';
}catch(error){report.status='failed';report.errorType=error.constructor.name;}
finally{
  if(removed&&name&&!Object.hasOwn(await get(),name)){
    const params=new URLSearchParams({name});for(const s of sources)params.append('src',s);
    const restored=await fetch(base+'?'+params,{method:'PUT',signal:AbortSignal.timeout(5000)});
    report.emergencyRestore=restored.ok&&Object.hasOwn(await get(),name);
  }
  report.finished=new Date().toISOString();
  const line='[registry-recovery-071] '+JSON.stringify(report)+'\n';
  fs.writeFileSync('/data/registry-recovery-20261125.json',JSON.stringify(report,null,2),{mode:0o600});
  fs.writeFileSync('/proc/1/fd/1',line);console.log(line);
}
