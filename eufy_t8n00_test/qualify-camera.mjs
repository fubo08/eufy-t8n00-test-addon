// My isolated hardware qualification harness. Created with Codex.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REVISION = '0.5.0-beta.22';

export async function qualify(sdk, saved, report, email, countryCode = 'DE') {
  if (!sdk.isSessionValid(saved)) throw new Error('cached_session_unusable');
  const store = new sdk.MemorySessionStore();
  store.save(structuredClone(saved));
  const logger = {
    debug(message) {
      if (/^\[rtc\] \S+ authenticated — call$/.test(message)) report.callAuthenticated = true;
      if (/^\[rtc\] \S+ cmd 1277 acked$/.test(message)) report.command1277Ack = true;
    },
    info() {}, warn() {}, error() {},
  };
  // No account password: an expired/rejected cached token must not trigger a fresh login.
  // Email supplies the protocol's user_name; no password is ever supplied.
  const client = new sdk.EufyMega({ email, countryCode, store, autoRealtime: false, pollMs: 0, prewarmEvents: [], logger });
  client.on('error', () => {});
  try {
    const login = await client.login();
    if (login.status !== sdk.LoginStatus.Ok || login.session?.raw?.restored !== true) {
      throw new Error('cached_session_not_restored');
    }
    report.sessionRestored = true;
    const nvrs = (await client.getDevices()).filter(d => d.model === 'T8N00');
    if (nvrs.length !== 1) throw new Error('expected_one_t8n00');
    const cameras = (await client.getDevices()).filter(d =>
      ['T8E00', 'T8P00'].includes(d.model) && d.stationSn === nvrs[0].sn);
    const target = cameras.find(d => d.model === 'T8E00') ?? cameras[0];
    if (!target) throw new Error('no_attached_camera');
    const device = await client.getDevice(target.sn);
    const camera = device.camera();
    // HA independently reported the S4 night-vision setting as Infrared before this test.
    if (camera?.nightVision !== 1 || typeof camera.setNightVision !== 'function') {
      throw new Error('reported_night_vision_not_infrared');
    }
    report.cameraModel = target.model;
    report.reportedNightVisionBefore = 1;
    report.stage = 'sending_same_night_vision';
    const start = Date.now();
    await camera.setNightVision(1);
    report.commandMs = Date.now() - start;
    report.setterCompleted = true;
    if (!report.command1277Ack || !report.callAuthenticated) throw new Error('rtc_ack_evidence_missing');
    report.status = 'passed';
  } finally {
    await client.disconnect();
  }
}

export async function main() {
  const options = JSON.parse(readFileSync('/data/options.json', 'utf8'));
  if (options.qualify_camera_nightvision_beta22 !== true) return;
  const path = `/data/qualification-camera-nightvision-${REVISION}.json`;
  if (existsSync(path)) {
    console.info('[camera-qualification] This revision was already attempted; no command repeated.');
    return;
  }
  const report = { revision: REVISION, timestamp: new Date().toISOString(), status: 'started', stage: 'loading', command1277Ack: false, callAuthenticated: false };
  const save = () => writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  save(); // Before any network operation, so a crash/restart never repeats the command.
  const timer = setTimeout(() => {
    report.status = 'timeout';
    save();
    console.info('[camera-qualification] ' + JSON.stringify(report));
    process.exit(1);
  }, 90000);
  try {
    const sdk = await import('/camera-qualification/sdk/dist/index.js');
    const saved = JSON.parse(readFileSync('/data/.eufy-session.json', 'utf8'));
    await qualify(sdk, saved, report, options.email, options.country);
  } catch (error) {
    report.status = 'failed';
    // Only known harness errors are recorded. SDK errors may contain account or device details.
    const safe = ['cached_session_unusable', 'cached_session_not_restored', 'expected_one_t8n00', 'reported_night_vision_not_infrared', 'no_attached_camera', 'rtc_ack_evidence_missing'];
    report.reason = safe.includes(error?.message) ? error.message : 'sdk_or_environment_error';
    // Classify known SDK errors without writing identifiers, tokens or raw messages.
    const message = String(error?.message ?? '');
    if (message.includes('is not routable over the RTC control channel')) report.failureKind = 'unsupported_command_form';
    else if (message.includes('rejected cmd')) report.failureKind = 'device_rejected_command';
    else if (message.includes('ACK timed out')) report.failureKind = 'ack_timeout';
    else if (message.includes('did not come up')) report.failureKind = 'channel_start_timeout';
    else if (message.includes('session closed')) report.failureKind = 'session_closed';
  } finally {
    clearTimeout(timer);
    save();
    console.info('[camera-qualification] ' + JSON.stringify(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
  process.exit(0);
}
