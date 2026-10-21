// My integration qualification of independent NVR optical views on beta.74. Created with Codex.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { openBetaLiveFeed } from './nvr-beta-live-feed.mjs';
export const REVISION = 'dd35b27fc2eccbd318fcec671f8d806b6a8ed54f';
export const PORTAL_REVISION = '38e0c73ee6a53730d573dbd04d7d701ba58031eb';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function measure(client, target, duration = 120000) {
  const result = { model: target.model, view: target.view ?? 0, frames: 0, audioFrames: 0,
    decodedFrames: 0, decoderWarnings: 0, maxGapMs: 0, firstVideoMs: null };
  const start = performance.now();
  let last, decoder, decoderDone, buffer = '', feed;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), duration);
  try {
    const device = await client.getDevice(target.sn);
    feed = await openBetaLiveFeed(device.camera(), { signal: abort.signal, view: target.view,
      onAudio(frame) { result.audioFrames++; result.audioCodec = frame.codec; } });
    for await (const frame of feed) {
      const now = performance.now();
      result.firstVideoMs ??= Math.round(now - start);
      if (last !== undefined) result.maxGapMs = Math.max(result.maxGapMs, Math.round(now - last));
      last = now;
      result.frames++; result.codec = frame.codec;
      result.width = frame.width; result.height = frame.height;
      if (!decoder) {
        decoder = spawn('ffmpeg', ['-hide_banner','-loglevel','warning','-f',frame.codec === 'h265' ? 'hevc' : 'h264',
          '-i','pipe:0','-an','-progress','pipe:1','-f','null','-'], { stdio:['pipe','pipe','pipe'] });
        decoderDone = new Promise(resolve => {
          decoder.on('error', () => { result.decoderFailed = true; resolve(); });
          decoder.on('close', code => { result.decoderExit = code; resolve(); });
        });
        decoder.stdin.on('error', () => { result.decoderFailed = true; abort.abort(); });
        decoder.stderr.on('data', chunk => { result.decoderWarnings += chunk.toString().split('\n').filter(Boolean).length; });
        decoder.stdout.on('data', chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n'); buffer = lines.pop();
          for (const line of lines) if (/^frame=\d+$/.test(line)) result.decodedFrames = Number(line.slice(6));
        });
      }
      if (!decoder.stdin.write(frame.data)) {
        await new Promise(resolve => {
          const finish = () => { decoder.stdin.off('drain', finish); abort.signal.removeEventListener('abort', finish); resolve(); };
          decoder.stdin.once('drain', finish);
          abort.signal.addEventListener('abort', finish, { once:true });
          if (abort.signal.aborted) finish();
        });
      }
    }
  } catch { if (!abort.signal.aborted) result.streamFailed = true; }
  finally {
    clearTimeout(timer); feed?.destroy();
    if (decoder) {
      decoder.stdin.end();
      const kill = setTimeout(() => decoder.kill('SIGKILL'), 5000);
      await decoderDone; clearTimeout(kill);
    }
  }
  result.elapsedMs = Math.round(performance.now()-start);
  result.earlyStop = !abort.signal.aborted;
  result.validVideo = result.decodedFrames > 0 && result.decoderExit === 0 && !result.decoderFailed;
  return result;
}

export async function qualify(sdk, saved, options, report, save) {
  if (!sdk.isSessionValid(saved)) throw new Error('cached_session_unusable');
  const store = new sdk.MemorySessionStore(); store.save(structuredClone(saved));
  const client = new sdk.EufyMega({ email:options.email, countryCode:options.country, store,
    autoRealtime:false, pollMs:0, storedSnapshotCache:false,
    logger:{ debug(){}, info(){}, warn(){}, error(){} } });
  client.on('error', () => {});
  try {
    const login = await client.login();
    if (login.status !== sdk.LoginStatus.Ok || login.session?.raw?.restored !== true) throw new Error('cached_session_not_restored');
    report.restored = true;
    const devices = await client.getDevices();
    const nvr = devices.filter(d => d.model === 'T8N00');
    if (nvr.length !== 1) throw new Error('expected_one_nvr');
    const find = model => devices.find(d => d.model === model && d.stationSn === nvr[0].sn);
    const e40 = find('T8P00'), s4 = find('T8E00');
    if (!e40 || !s4) throw new Error('missing_camera_models');
    if (report.mode === 'optical-views') {
      const s4Camera = (await client.getDevice(s4.sn)).camera();
      const e40Camera = (await client.getDevice(e40.sn)).camera();
      report.views = { S4: s4Camera.views?.(), E40: e40Camera.views?.() };
      if (JSON.stringify(report.views) !== JSON.stringify({ S4:[0,1], E40:[0] })) throw new Error('unexpected_optical_views');
      try {
        const unexpected = await e40Camera.live({ view:1 });
        unexpected.stop();
        throw new Error('e40_secondary_was_accepted');
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        report.e40SecondaryRejected = true;
      }
      for (const view of [undefined,1]) {
        report.stage = `S4-single-view-${view ?? 0}`; save();
        report.runs.push(await measure(client,{...s4,view},90000)); save();
        await delay(10000);
      }
      report.stage = 'S4-concurrent-views-and-repeated-consumer'; save();
      const fixed = measure(client,{...s4,view:0},120000);
      await delay(4000);
      const movable = measure(client,{...s4,view:1},135000);
      const repeated = measure(client,{...s4,view:0},90000);
      report.concurrent = await Promise.all([fixed,movable,repeated]);
      report.status = [...report.runs,...report.concurrent].every(r => r.validVideo && r.audioFrames > 0 && !r.streamFailed && !r.earlyStop)
        ? 'media_observed' : 'failed';
      report.limits = 'Exact extracted optical-view SDK; decoded video and audio-packet receipt only. Audible sound, browser playback, visual lens identity and selected ICE candidate require separate observation.';
      return;
    }
    if (report.mode === 'portal-shard') {
      report.phoneShard = client.mega.rtcShard;
      report.resolvedShards = [];
      const resolve = client.rtc.deps.shard;
      client.rtc.deps.shard = async () => {
        const shard = await resolve();
        report.resolvedShards.push(shard);
        save();
        return shard;
      };
      for (let attempt=0; attempt<2; attempt++) {
        report.stage = `portal-E40-start-${attempt+1}`; save();
        report.runs.push(await measure(client,e40,60000)); save();
        await delay(10000);
      }
      report.status = report.runs.every(r => r.validVideo && r.audioFrames > 0 && !r.streamFailed && !r.earlyStop)
        && report.resolvedShards.length >= 2 ? 'media_observed' : 'failed';
      report.limits = 'Combined PR450 plus PR436 route; DE account only. Decoding and packet evidence, not audible playback or other account countries.';
      return;
    }
    for (const target of [e40,s4]) {
      report.stage = `${target.model}-primary`; save();
      report.runs.push(await measure(client,target)); save();
      await delay(10000); // Wait for shared-source linger before the next independent start.
    }
    report.stage = 'simultaneous-e40-s4'; save();
    const first = measure(client,e40,120000);
    await delay(4000);
    const second = measure(client,s4,135000);
    report.concurrent = await Promise.all([first,second]);
    report.status = [...report.runs,...report.concurrent].every(r => r.validVideo && r.audioFrames > 0 && !r.streamFailed && !r.earlyStop)
      ? 'media_observed' : 'failed';
    report.limits = 'Decoder and packet evidence only; audible sound, browser playback and selected ICE candidate not verified.';
  } finally { await client.disconnect(); }
}

export async function main() {
  const options = JSON.parse(readFileSync('/data/options.json','utf8'));
  const jobs = [
    { enabled:options.qualify_pr441, revision:REVISION, sdkPath:'/media-qualification/sdk/dist/index.js', mode:'optical-views', timeout:420000 },
    { enabled:options.qualify_pr436, revision:REVISION, sdkPath:'/media-qualification/sdk/dist/index.js', mode:'primary', timeout:480000 },
    { enabled:options.qualify_pr450, revision:PORTAL_REVISION, sdkPath:'/portal-qualification/sdk/dist/index.js', mode:'portal-shard', timeout:180000 },
  ];
  for (const job of jobs) {
    if (job.enabled !== true) continue;
    const path = `/data/qualification-media-${job.revision}.json`;
    if (existsSync(path)) { console.info('[media-qualification] Exact revision already attempted; skipping.'); continue; }
    const report = { revision:job.revision, mode:job.mode, testBridgeVersion:'0.3.40', timestamp:new Date().toISOString(), status:'started', runs:[] };
    const save = () => writeFileSync(path,JSON.stringify(report,null,2),{mode:0o600});
    save();
    const timer = setTimeout(() => { report.status='timeout'; save(); console.info('[media-qualification] '+JSON.stringify(report)); process.exit(1); },job.timeout);
    try {
      const sdk = await import(job.sdkPath);
      const saved = JSON.parse(readFileSync('/data/.eufy-session.json','utf8'));
      await qualify(sdk,saved,options,report,save);
    } catch { report.status='failed'; report.reason='qualification_failed_without_sensitive_details'; }
    finally { clearTimeout(timer); save(); console.info('[media-qualification] '+JSON.stringify(report)); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { await main(); process.exit(0); }
