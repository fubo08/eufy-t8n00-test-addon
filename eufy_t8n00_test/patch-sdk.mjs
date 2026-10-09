import { readFileSync, writeFileSync } from 'node:fs';
const root = process.env.SDK_PATCH_ROOT ?? '/sdk';
function patch(file, before, after) {
  const path = `${root}/${file}`;
  const source = readFileSync(path, 'utf8');
  if (source.split(before).length !== 2) throw new Error(`Unexpected ${file}; review command transport patch`);
  writeFileSync(path, source.replace(before, after));
}
patch('src/client/types.ts',
  '  /** Experimental media ICE selection. Control sessions remain relay-only. */',
  `  /** RTC command ICE selection. Defaults to relay. */
  rtcCommandIcePolicy?: "relay" | "all";
  /** RTC command signaling. Defaults to the compact scall exchange. */
  rtcCommandSignalingMode?: "call" | "scall";
  /** Experimental media ICE selection, independent of command sessions. */`);
patch('src/client/eufy-mega.ts',
  '    this.rtc = new RtcCommandRouter({',
  `    this.rtc = new RtcCommandRouter({
      iceTransportPolicy: opts.rtcCommandIcePolicy,
      signalingMode: opts.rtcCommandSignalingMode,`);
patch('src/transport/rtc/command-router.ts',
  'export interface RtcCommandRouterDeps {',
  `export interface RtcCommandRouterDeps {
  /** ICE candidate policy for command sessions; defaults to relay. */
  iceTransportPolicy?: "relay" | "all";
  /** Signaling exchange for command sessions; defaults to scall. */
  signalingMode?: "call" | "scall";`);
patch('src/transport/rtc/command-router.ts',
  '      peer: { logger: this.deps.logger },',
  `      signalingMode: this.deps.signalingMode,
      peer: { logger: this.deps.logger, iceTransportPolicy: this.deps.iceTransportPolicy },`);
patch('src/transport/rtc/session.ts',
  'this.logger.debug(`[rtc] ${this.opts.stationSn} authenticated — scall`);',
  'this.logger.debug(`[rtc] ${this.opts.stationSn} authenticated — ${this.opts.signalingMode ?? "scall"}`);');
patch('src/transport/rtc/__tests__/command-router.spec.ts',
  'describe("RtcCommandRouter", () => {',
  `describe("RtcCommandRouter", () => {
  it.each([
    [undefined, undefined],
    ["call", "all"],
    ["call", "relay"],
    ["scall", "relay"],
  ] as const)("negotiates commands with signaling=%s and ICE=%s without changing the command", async (signalingMode, iceTransportPolicy) => {
    const { router, sessions } = makeRouter({ signalingMode, iceTransportPolicy });
    try {
      await router.dispatchCommand(ST, arming(1));
      expect(sessions[0]!.opts.signalingMode).toBe(signalingMode);
      expect(sessions[0]!.opts.peer?.iceTransportPolicy).toBe(iceTransportPolicy);
      expect(sessions[0]!.sent).toHaveLength(1);
      expect(sent(sessions[0]!.sent[0]!).body).toMatchObject({cmd: 1224, payload: {mode_type: 1}});
    } finally { router.close(); }
  });`);
