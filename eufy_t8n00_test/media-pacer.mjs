// Pace complete multiplexed AV fragments on one source clock. Do not retimestamp media.
export function createMediaPacer({ delayMs = 1500, write, onError, onRebuffer = () => {},
  now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const queue = [];
  let timer, origin, sourceOrigin, lastSource, bytes = 0, closed = false;
  function close() {
    closed = true;
    clearTimer(timer);
    queue.length = 0;
    bytes = 0;
  }
  function drain() {
    timer = undefined;
    if (closed) return;
    try {
      while (queue.length) {
        const item = queue[0];
        const wait = origin + item.source - sourceOrigin - now();
        if (wait > 0) { timer = setTimer(drain, Math.ceil(wait)); return; }
        queue.shift();
        bytes -= item.data.length;
        write(item.data);
      }
    } catch (error) { close(); onError(error); }
  }
  return {
    close,
    push(data, sourceMs) {
      if (closed) return;
      if (!Number.isFinite(sourceMs)) throw new Error("missing fragment source clock");
      if (lastSource !== undefined && sourceMs < lastSource) throw new Error("fragment source clock moved backwards");
      if (bytes + data.length > 8 * 1024 * 1024) throw new Error("media pacing buffer exceeds 8 MiB");
      const time = now();
      if (origin === undefined) { origin = time + delayMs; sourceOrigin = sourceMs; }
      else if (!queue.length && delayMs > 0 && origin + sourceMs - sourceOrigin < time) {
        // A gap exceeded the reserve: rebuild it instead of dumping a late burst.
        origin = time + delayMs;
        sourceOrigin = sourceMs;
        onRebuffer();
      }
      lastSource = sourceMs;
      queue.push({ data, source: sourceMs });
      bytes += data.length;
      if (timer === undefined) drain();
    },
  };
}
