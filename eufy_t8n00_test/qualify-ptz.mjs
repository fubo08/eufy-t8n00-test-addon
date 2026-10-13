// My isolated hardware qualification harness. Created with Codex.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REVISION = 'd8a4167bf1018fa8816f05127d6c38a031050420';

export async function qualify(sdk, saved, report, email, countryCode = 'DE', targetSn) {
  if (!targetSn) throw new Error('target_required');
  if (!sdk.isSessionValid(saved)) throw new Error('cached_session_unusable');
  const store = new sdk.MemorySessionStore();
  store.save(structuredClone(saved));
  const logger = {
    debug(message) {
      if (/^\[rtc\] \S+ authenticated — call$/.test(message)) report.callAuthenticated = true;
      if (/^\[rtc\] \S+ cmd 6030 acked$/.test(message)) report.command6030AckCount = (report.command6030AckCount ?? 0) + 1;
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
      d.model === 'T8E00' && d.stationSn === nvrs[0].sn && d.sn === targetSn);
    if (cameras.length !== 1) throw new Error('expected_one_attached_s4');
    const target = cameras[0];
    const device = await client.getDevice(target.sn);
    const ptz = device.ptz();
    if (!ptz || typeof ptz.rotate !== 'function') throw new Error('ptz_not_available');
    report.cameraModel = target.model;
    report.ptzAvailable = true;
    report.movements = [];
    for (const direction of ['left', 'left']) {
      report.stage = 'rotating_' + direction;
      const start = Date.now();
      await ptz.rotate(direction);
      report.movements.push({ direction, commandMs: Date.now() - start, setterCompleted: true });
      if (report.movements.length === 1) await new Promise(resolve => setTimeout(resolve, 5000));
    }
    if (report.command6030AckCount !== 2 || !report.callAuthenticated) throw new Error('rtc_ack_evidence_missing');
    report.status = 'commands_acked';
    report.physicalMovement = 'requires_independent_observation';
  } finally {
    await client.disconnect();
  }
}

export async function main() {
  const options = JSON.parse(readFileSync('/data/options.json', 'utf8'));
  if (options.qualify_pr376 !== true) return;
  const path = `/data/qualification-ptz-lefttwice-${REVISION}.json`;
  if (existsSync(path)) {
    console.info('[ptz-qualification] This revision was already attempted; no command repeated.');
    return;
  }
  const report = { revision: REVISION, timestamp: new Date().toISOString(), status: 'started', stage: 'loading', command6030AckCount: 0, callAuthenticated: false };
  const save = () => writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  save(); // Before any network operation, so a crash/restart never repeats the command.
  const timer = setTimeout(() => {
    report.status = 'timeout';
    save();
    console.info('[ptz-qualification] ' + JSON.stringify(report));
    process.exit(1);
  }, 90000);
  try {
    const sdk = await import('/ptz-qualification/sdk/dist/index.js');
    const saved = JSON.parse(readFileSync('/data/.eufy-session.json', 'utf8'));
    await qualify(sdk, saved, report, options.email, options.country, options.qualify_pr376_target);
  } catch (error) {
    report.status = 'failed';
    // Only known harness errors are recorded. SDK errors may contain account or device details.
    const safe = ['target_required', 'cached_session_unusable', 'cached_session_not_restored', 'expected_one_t8n00', 'expected_one_attached_s4', 'ptz_not_available', 'rtc_ack_evidence_missing'];
    report.reason = safe.includes(error?.message) ? error.message : 'sdk_or_environment_error';
    // Classify known SDK errors without writing identifiers, tokens or raw messages.
    const message = String(error?.message ?? '');
    if (message === 'RTC command requires an unambiguous attached-device channel') report.failureKind = 'ambiguous_attached_channel';
    report.errorType = ['Error','TypeError','RangeError'].includes(error?.name) ? error.name : 'SDKError';
    if (message.includes('is not routable over the RTC control channel')) report.failureKind = 'unsupported_command_form';
    else if (message.includes('rejected cmd')) report.failureKind = 'device_rejected_command';
    else if (message.includes('ACK timed out')) report.failureKind = 'ack_timeout';
    else if (message.includes('did not come up')) report.failureKind = 'channel_start_timeout';
    else if (message.includes('session closed')) report.failureKind = 'session_closed';
  } finally {
    clearTimeout(timer);
    save();
    console.info('[ptz-qualification] ' + JSON.stringify(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
  process.exit(0);
}
