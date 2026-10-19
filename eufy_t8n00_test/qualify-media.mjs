// My integration qualification of the reduced PR #436 on current beta. Created with Codex.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { openBetaLiveFeed } from './nvr-beta-live-feed.mjs';
export const REVISION = 'd8cc367895f286cc665f06449050c8a65bbd5fd9';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function measure(client, target, duration = 120000) {
  const result = { model: target.model, frames: 0, audioFrames: 0,
    decodedFrames: 0, decoderWarnings: 0, maxGapMs: 0, firstVideoMs: null };
  const start = performance.now();
  let last, decoder, decoderDone, buffer = '', feed;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), duration);
  try {
    const device = await client.getDevice(target.sn);
    feed = await openBetaLiveFeed(device.camera(), { signal: abort.signal,
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
  if (options.qualify_pr436 !== true) return;
  const path = `/data/qualification-media-${REVISION}.json`;
  if (existsSync(path)) { console.info('[media-qualification] Exact revision already attempted; skipping.'); return; }
  const report = { revision:REVISION, testBridgeVersion:'0.3.32', timestamp:new Date().toISOString(), status:'started', runs:[] };
  const save = () => writeFileSync(path,JSON.stringify(report,null,2),{mode:0o600});
  save();
  const timer = setTimeout(() => { report.status='timeout'; save(); console.info('[media-qualification] '+JSON.stringify(report)); process.exit(1); },480000);
  try {
    const sdk = await import('/media-qualification/sdk/dist/index.js');
    const saved = JSON.parse(readFileSync('/data/.eufy-session.json','utf8'));
    await qualify(sdk,saved,options,report,save);
  } catch { report.status='failed'; report.reason='qualification_failed_without_sensitive_details'; }
  finally { clearTimeout(timer); save(); console.info('[media-qualification] '+JSON.stringify(report)); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { await main(); process.exit(0); }
