// My isolated hardware qualification harness. Created with Codex.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REVISION = '897201955d58e4ce1932e5d27575528f648d8e43';

export async function qualify(sdk, saved, report, email, countryCode = 'DE') {
  if (!sdk.isSessionValid(saved)) throw new Error('cached_session_unusable');
  const store = new sdk.MemorySessionStore();
  store.save(structuredClone(saved));
  const logger = {
    debug(message) {
      if (/^\[rtc\] \S+ authenticated — call$/.test(message)) report.callAuthenticated = true;
      if (/^\[rtc\] \S+ cmd 1224 acked$/.test(message)) report.command1224Ack = true;
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
    const device = await client.getDevice(nvrs[0].sn);
    const arming = device.arming();
    // Cloud state can lag. Enable only after independently checking Home in HA/the app.
    if (arming?.mode !== 1) throw new Error('reported_mode_not_home');
    report.reportedModeBefore = 1;
    report.stage = 'sending_home';
    const start = Date.now();
    await arming.setMode('home');
    report.commandMs = Date.now() - start;
    report.setterCompleted = true;
    if (!report.command1224Ack || !report.callAuthenticated) throw new Error('rtc_ack_evidence_missing');
    report.status = 'passed';
  } finally {
    await client.disconnect();
  }
}

export async function main() {
  const options = JSON.parse(readFileSync('/data/options.json', 'utf8'));
  if (options.qualify_pr354 !== true) return;
  const path = `/data/qualification-354-${REVISION}.json`;
  if (existsSync(path)) {
    console.info('[qualification] This revision was already attempted; no command repeated.');
    return;
  }
  const report = { revision: REVISION, timestamp: new Date().toISOString(), status: 'started', stage: 'loading', command1224Ack: false, callAuthenticated: false };
  const save = () => writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  save(); // Before any network operation, so a crash/restart never repeats the command.
  const timer = setTimeout(() => {
    report.status = 'timeout';
    save();
    console.info('[qualification] ' + JSON.stringify(report));
    process.exit(1);
  }, 90000);
  try {
    const sdk = await import('/qualification/sdk/dist/index.js');
    const saved = JSON.parse(readFileSync('/data/.eufy-session.json', 'utf8'));
    await qualify(sdk, saved, report, options.email, options.country);
  } catch (error) {
    report.status = 'failed';
    // Only known harness errors are recorded. SDK errors may contain account or device details.
    const safe = ['cached_session_unusable', 'cached_session_not_restored', 'expected_one_t8n00', 'reported_mode_not_home', 'rtc_ack_evidence_missing'];
    report.reason = safe.includes(error?.message) ? error.message : 'sdk_or_environment_error';
  } finally {
    clearTimeout(timer);
    save();
    console.info('[qualification] ' + JSON.stringify(report));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
  process.exit(0);
}
