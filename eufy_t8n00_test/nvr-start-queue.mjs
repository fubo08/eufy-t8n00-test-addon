// Native NVR calls can collide while negotiating. Space starts, not playback.
export function createStartQueue(spacingMs = 8000) {
  const queue = [];
  let busy = false;
  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const item = queue.shift();
        item.signal?.removeEventListener("abort", item.abort);
        if (item.signal?.aborted) {
          item.reject(item.signal.reason);
          continue;
        }
        const started = performance.now();
        try { item.resolve(await item.start()); }
        catch (error) { item.reject(error); }
        const remaining = spacingMs - (performance.now() - started);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      }
    } finally { busy = false; }
  }
  return function run(start, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      const item = { start, signal, resolve, reject };
      item.abort = () => {
        const index = queue.indexOf(item);
        if (index >= 0) queue.splice(index, 1);
        reject(signal.reason);
      };
      signal?.addEventListener("abort", item.abort, { once: true });
      queue.push(item);
      void drain();
    });
  };
}
