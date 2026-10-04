import { initLogger } from 'node-datachannel';
import { nativeHandshakeSummary } from './rtc-native-summary.mjs';
if (process.env.EUFY_RTC_VIDEO_ICE_POLICY === 'all') {
  let lines = 0;
  initLogger('Verbose', (_level, message) => {
    const summary = nativeHandshakeSummary(message);
    if (summary && lines < 200) {
      console.info(`[rtc:native] ${summary}`);
      if (++lines === 200) console.info('[rtc:native] diagnostic limit reached; restart to capture again');
    }
  });
  console.info('[rtc:native] filtered handshake diagnostics enabled (process-wide)');
}
