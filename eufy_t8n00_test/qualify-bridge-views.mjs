// My bounded exact-source bridge optical-view qualification. Created with Codex.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { loadConfig } from './bridge/src/config.mjs';
import { createState } from './bridge/src/state.mjs';
import { createDeviceView } from './bridge/src/device-view.mjs';
import { createHttpHandler } from './bridge/src/http-routes.mjs';
import { createWsServer } from './bridge/src/ws-server.mjs';
import { writeGo2rtcConfig } from './bridge/go2rtc-config.mjs';
import { closeStreamClients } from './bridge/streams.mjs';
import * as sdk from './bridge/node_modules/@mega-yfue/eufy-sdk/dist/index.js';

const BRIDGE = 'c5fed3bbafae782219f5f350ef2427bfcbffd848';
const SDK = '4f5d73f38e8bd62e74c1410ab510844a8b099307';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = new Set();
const sanitize = (s) => s.replace(/rtsp:\/\/\S+/g, '[rtsp-source]').replace(/http:\/\/\S+/g, '[http-source]').replace(/T[A-Z0-9]{10,}/g, '[device]').replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[email]').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[address]').slice(-2000);

/** Count decoded frames without logging private source URLs or captured video. */
async function measure(url, seconds) {
  const result = { seconds, frames: 0, warnings: 0, firstFrameMs: null };
  const started = performance.now();
  const proc = spawn('ffmpeg', ['-hide_banner','-loglevel','warning','-rtsp_transport','tcp',
    '-i',url,'-t',String(seconds),'-an','-progress','pipe:1','-f','null','-'],
    { stdio: ['ignore','pipe','pipe'] });
  children.add(proc);
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) if (/^frame=\d+$/.test(line)) {
      result.frames = Number(line.slice(6));
      if (result.frames > 0) result.firstFrameMs ??= Math.round(performance.now()-started);
    }
  });
  proc.stderr.on('data', (chunk) => { result.warnings += chunk.toString().split('\n').filter(Boolean).length; result.diagnostics = sanitize((result.diagnostics ?? '') + chunk.toString()); });
  const done = new Promise((resolve) => {
    proc.once('error', () => { result.error = true; resolve(); });
    proc.once('close', (code) => { result.exit = code; resolve(); });
  });
  const timeout = setTimeout(() => { result.timeout = true; proc.kill('SIGKILL'); }, (seconds+45)*1000);
  await done; clearTimeout(timeout); children.delete(proc);
  result.elapsedMs = Math.round(performance.now()-started);
  result.ok = result.exit === 0 && result.frames > seconds*5 && !result.timeout && !result.error;
  return result;
}

async function main() {
  const options = JSON.parse(await fs.readFile('/data/options.json','utf8'));
  if (options.qualify_bridge_views !== true) return;
  const reportPath = `/data/qualification-bridge-views-${BRIDGE}-decoder-fixed.json`;
  if (existsSync(reportPath)) { console.info('[bridge-views-qualification] Already attempted; skipping.'); return; }
  const report = { bridge: BRIDGE, sdk: SDK, version: '0.3.45', timestamp: new Date().toISOString(), status:'started' };
  const save = () => fs.writeFile(reportPath, JSON.stringify(report,null,2), {mode:0o600});
  await save();
  let client, server, dir;
  const deadline = setTimeout(() => {
    report.status = 'timeout';
    server?.closeAllConnections();
    for (const proc of children) proc.kill('SIGTERM');
    void save().finally(() => { console.info('[bridge-views-qualification] '+JSON.stringify(report));
      setTimeout(() => { for (const proc of children) proc.kill('SIGKILL'); process.exit(1); },1000); });
  }, 240000);
  try {
    const saved = JSON.parse(await fs.readFile('/data/.eufy-session.json','utf8'));
    if (!sdk.isSessionValid(saved)) throw new Error('unusable cached session');
    const store = new sdk.MemorySessionStore(); store.save(structuredClone(saved));
    client = new sdk.EufyMega({email:options.email, countryCode:options.country, store,
      autoRealtime:false, pollMs:0, storedSnapshotCache:false,
      logger:{debug(){},info(){},warn(){},error(){}}});
    client.on('error',()=>{});
    const login = await client.login();
    if (login.status !== sdk.LoginStatus.Ok || login.session?.raw?.restored !== true) throw new Error('session not restored');
    report.restored = true;
    const devices = await client.getDevices();
    const nvr = devices.find((d)=>d.model==='T8N00');
    const target = devices.find((d)=>d.model==='T8E00' && d.stationSn===nvr?.sn);
    if (!nvr || !target) throw new Error('missing hardware');
    dir = await fs.mkdtemp(path.join(os.tmpdir(),'bridge-views-'));
    const session = path.join(dir,'session.json');
    await fs.writeFile(session,JSON.stringify(saved),{mode:0o600});
    const config = loadConfig({EUFY_EMAIL:options.email, EUFY_COUNTRY:options.country, EUFY_SESSION:session,
      BRIDGE_HOST:'127.0.0.1', BRIDGE_SELF_HOST:'127.0.0.1', BRIDGE_POLL_MS:'0',
      GO2RTC_CONFIG:path.join(dir,'go2rtc.yaml')});
    const state = createState(); state.flags.ready = true;
    const ctx = {...config, eufy:client, state, eventImageDir:dir,
      authStatus:()=>({state:'ok'}), eventLog(){}, dbg(){}, broadcast(){}, SCHEMA_VERSION:1};
    Object.assign(ctx,createDeviceView(ctx));
    const handler = createHttpHandler(ctx);
    server = http.createServer((req,res)=>void handler(req,res));
    const ws = createWsServer(ctx,server); Object.assign(ctx,ws);
    await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
    ctx.cfg.port = server.address().port;
    const messages = [];
    await ws.handleMessage({readyState:1,OPEN:1,send:(s)=>messages.push(JSON.parse(s))},
      Buffer.from(JSON.stringify({id:1,cmd:'device.state',sn:target.sn})));
    const summary = messages[0]?.device;
    report.views = summary?.views?.map((v)=>v.view);
    if (JSON.stringify(report.views)!=='[0,1]') throw new Error('views not advertised');
    const base = `http://127.0.0.1:${ctx.cfg.port}`;
    report.snapshots = [];
    for (const view of summary.views) {
      const response = await fetch(base+view.snapshot+(view.view===0?'?':'&')+'mode=live', {signal:AbortSignal.timeout(30000)});
      const jpeg = Buffer.from(await response.arrayBuffer());
      report.snapshots.push({view:view.view,status:response.status,bytes:jpeg.length,
        jpeg:jpeg[0]===255 && jpeg[1]===216});
      await sleep(9000);
    }
    const secondary = summary.views[1];
    const cached = await fetch(base+secondary.snapshot+'&mode=stored');
    const cachedBytes = Buffer.from(await cached.arrayBuffer());
    report.secondaryCache = {status:cached.status,bytes:cachedBytes.length,jpeg:cachedBytes[0]===255 && cachedBytes[1]===216};
    const invalid = await fetch(base+`/stream/${target.sn}?view=99`); await invalid.arrayBuffer();
    report.invalidViewStatus = invalid.status;
    await writeGo2rtcConfig(ctx.cfg,[summary]);
    const go = spawn('go2rtc',['-config',ctx.cfg.go2rtcConfig],{stdio:['ignore','pipe','pipe']});
    const goLog = (chunk) => { report.go2rtcDiagnostics = sanitize((report.go2rtcDiagnostics ?? '') + chunk.toString()); };
    go.stdout.on('data',goLog); go.stderr.on('data',goLog);
    children.add(go); go.on('error',()=>{report.go2rtcError=true;});
    let ready = false;
    for (let i=0;i<50;i++) {
      try {
        const listed = await (await fetch('http://127.0.0.1:1984/api/streams')).json();
        if (summary.views.every((v)=>Object.hasOwn(listed,v.id))) {ready=true;break;}
      } catch {}
      await sleep(100);
    }
    report.sourcesRegistered = ready;
    if (!ready) throw new Error('go2rtc unavailable');
    report.stage = 'RTSP primary and secondary'; await save();
    const primary = measure(`rtsp://127.0.0.1:8554/${summary.views[0].id}`,30);
    await sleep(4000);
    const moving = measure(`rtsp://127.0.0.1:8554/${secondary.id}`,50);
    report.primary = await primary;
    report.otherStillStreaming = state.streaming.has(target.sn);
    report.secondary = await moving;
    report.status = report.primary.ok && report.secondary.ok && report.otherStillStreaming
      && report.snapshots.every((s)=>s.status===200 && s.jpeg) && report.secondaryCache.status===200
      && report.secondaryCache.jpeg && report.invalidViewStatus===404 ? 'media_observed' : 'failed';
    report.limits = 'Exact bridge source, official SDK beta source and bundled go2rtc; decoded RTSP video and JPEG checks. No audio support, visual physical lens identification, browser playback or other station topology is established by this run.';
  } catch {
    report.status = 'failed'; report.reason = 'qualification_failed_without_sensitive_details';
  } finally {
    clearTimeout(deadline);
    server?.closeAllConnections(); server?.close();
    for (const proc of children) proc.kill('SIGTERM');
    await sleep(1000);
    for (const proc of children) proc.kill('SIGKILL');
    await closeStreamClients(); await Promise.race([client?.disconnect(),sleep(3000)]);
    if (dir) await fs.rm(dir,{recursive:true,force:true});
    await save(); console.info('[bridge-views-qualification] '+JSON.stringify(report));
  }
}
await main();
process.exit(0);
