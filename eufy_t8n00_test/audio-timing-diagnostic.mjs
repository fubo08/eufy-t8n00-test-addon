// Temporary qualification-only observer. It never changes or retains encoded media.
// Created with Codex.
let firstArrival, lastArrival, firstSource, lastSource, timer;
const gaps=[], steps=[];
let frames=0, invalidClocks=0;
globalThis.__nvrAudioTiming = body => {
  const arrived=performance.now();
  const source=Number(body.readBigUInt64LE(8));
  if(!Number.isSafeInteger(source)){invalidClocks++;return;}
  firstArrival??=arrived;firstSource??=source;
  if(lastArrival!==undefined){gaps.push(arrived-lastArrival);steps.push(source-lastSource);}
  lastArrival=arrived;lastSource=source;frames++;
  if(!timer){timer=setTimeout(()=>{
    const sorted=[...gaps].sort((a,b)=>a-b);
    const counts={};for(const n of steps)counts[n]=(counts[n]??0)+1;
    console.log('[qualification-audio-timing] '+JSON.stringify({
      scope:'Passive RTC audio-header observer; no media payload retained or changed',
      frames,invalidClocks,arrivalSpanMs:Math.round(lastArrival-firstArrival),sourceSpan:lastSource-firstSource,
      maxArrivalGapMs:Math.round(sorted.at(-1)??0),p95ArrivalGapMs:Math.round(sorted[Math.floor(sorted.length*.95)]??0),
      gapsOver250ms:gaps.filter(n=>n>250).length,gapsOver1000ms:gaps.filter(n=>n>1000).length,
      sourceRegressions:steps.filter(n=>n<0).length,sourceSteps:counts,
    }));
  },60000);timer.unref();}
};
