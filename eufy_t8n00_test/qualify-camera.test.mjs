// My qualification safety checks. Created with Codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualify } from './qualify-camera.mjs';

function fixture({ valid = true, mode = false, ack = true, call = true } = {}) {
  const observed = { writes: [], closed: false };
  const sdk = {
    isSessionValid: () => valid,
    MemorySessionStore: class { save(s) { observed.saved = s; } },
    LoginStatus: { Ok: 'ok' },
    EufyMega: class {
      constructor(options) { observed.options = options; }
      on() {}
      async login() { return { status: 'ok', session: { raw: { restored: true } } }; }
      async getDevices() { return [{ model: 'T8N00', sn: 'synthetic' }, { model: 'T8E00', sn: 'synthetic-camera', stationSn: 'synthetic' }]; }
      async getDevice() { return { camera: () => ({ statusLed: mode, async setStatusLed(value) {
        observed.writes.push(value);
        if (call) observed.options.logger.debug('[rtc] synthetic authenticated — call');
        if (ack) observed.options.logger.debug('[rtc] synthetic cmd 1045 acked');
      } }) }; }
      async disconnect() { observed.closed = true; }
    },
  };
  return { sdk, observed };
}

test('uses a private cached session, no login credentials, and requires real RTC evidence', async () => {
  const { sdk, observed } = fixture();
  const saved = { token: 'synthetic' }, report = {};
  await qualify(sdk, saved, report, 'synthetic@example.invalid');
  assert.equal(report.status, 'passed');
  assert.deepEqual(observed.writes, [false]);
  assert.notEqual(observed.saved, saved);
  assert.equal(observed.options.password, undefined);
  assert.equal(observed.options.email, 'synthetic@example.invalid');
  assert.equal(observed.options.autoRealtime, false);
  assert.equal(observed.closed, true);
});
for (const mode of [true, 0, 1, undefined]) test(`never writes when reported mode is ${mode}`, async () => {
  const { sdk, observed } = fixture({ mode: mode === undefined ? null : mode });
  await assert.rejects(qualify(sdk, {}, {}), /reported_led_not_off/);
  assert.deepEqual(observed.writes, []);
  assert.equal(observed.closed, true);
});
test('unusable cache does not construct a network client', async () => {
  const { sdk, observed } = fixture({ valid: false });
  await assert.rejects(qualify(sdk, {}, {}), /cached_session_unusable/);
  assert.equal(observed.options, undefined);
});
for (const missing of ['ack', 'call']) test(`does not pass without ${missing}`, async () => {
  const { sdk } = fixture({ [missing]: false });
  const report = {};
  await assert.rejects(qualify(sdk, {}, report), /rtc_ack_evidence_missing/);
  assert.notEqual(report.status, 'passed');
});
