// My allow-listed failure metadata; no raw SDK messages are retained. Created with Codex.
export function failureMetadata(error, seen = new Set()) {
  if (!error || typeof error !== 'object' || seen.has(error) || seen.size >= 4) return undefined;
  seen.add(error);
  const result = { kind: 'unclassified' };
  if (error.name === 'LiveStreamStartError') {
    result.kind = 'live-start';
    if (['warm-timeout','source-error','source-ended'].includes(error.reason)) result.reason = error.reason;
    if (['awaiting-first-frame','audio-only','awaiting-keyframe'].includes(error.stage)) result.stage = error.stage;
    for (const key of ['attempts','timeoutMs']) if (Number.isSafeInteger(error[key]) && error[key] >= 0) result[key] = error[key];
  }
  const message = typeof error.message === 'string' ? error.message : '';
  const status = message.match(/\bscall answered (486|408)\b/);
  const refusal = message.match(/\bstart refused \(err (-?\d{1,10})\)/);
  if (status) { result.kind = 'remote-call-status'; result.status = Number(status[1]); }
  else if (refusal) { result.kind = 'media-start-refused'; result.code = Number(refusal[1]); }
  else if (/RTC signalling auth timeout/.test(message)) result.kind = 'signaling-auth-timeout';
  else if (/RTC signalling connect timeout/.test(message)) result.kind = 'signaling-connect-timeout';
  else if (/RTC signalling socket error/.test(message)) result.kind = 'signaling-socket-error';
  else if (/RTC signalling closed before open/.test(message)) result.kind = 'signaling-closed-before-open';
  else if (/RTC data channel .*:/.test(message)) result.kind = 'data-channel-error';
  else if (/command channel not open/.test(message)) result.kind = 'command-channel-not-open';
  else if (/rtc live .*: session closed/.test(message)) result.kind = 'session-closed';
  else if (/native peer|node-datachannel/.test(message)) result.kind = 'native-peer-error';
  const cause = failureMetadata(error.cause, seen);
  if (cause) result.cause = cause;
  return result;
}

export function traceMetadata(message) {
  if (typeof message !== 'string' || !message.startsWith('[rtc]')) return undefined;
  const peer = message.match(/^\[rtc\] peer state (new|connecting|connected|disconnected|failed|closed)$/);
  if (peer) return { event: 'peer-state', state: peer[1] };
  const channel = message.match(/^\[rtc\] data channel (open|closed) (WebrtcDataChannel|audio|idr|video|notify|download)$/);
  if (channel) return { event: 'data-channel', state: channel[1], channel: channel[2] };
  const closed = message.match(/ signalling closed (\d{3,4})\b/);
  if (closed) return { event: 'signaling-closed', code: Number(closed[1]) };
  for (const [pattern,event] of [
    [/ signalling connect /,'signaling-connect'],
    [/ authenticated — /,'signaling-authenticated'],
    [/ answered the hub's offer$/,'sdp-answer'],
    [/ hub hung up$/,'remote-hangup'],
    [/ command channel open$/,'command-channel-open'],
    [/ command channel closed$/,'command-channel-closed'],
  ]) if (pattern.test(message)) return { event };
  return undefined;
}
