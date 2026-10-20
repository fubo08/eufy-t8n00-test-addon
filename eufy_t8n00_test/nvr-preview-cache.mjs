import { mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

// Demand-driven stills, never seven permanent native calls. A cache hit returns
// immediately; only one decoder runs, with time for the native call to close
// before opening a different lens. Live consumers retain the other call slots.
export function createPreviewCache({ read, directory, now = Date.now,
  freshMs = 120000, releaseMs = 15000, demandMs = 300000, coldWaitMs = 7500,
  canRefresh = () => true, validImage = () => true, log = () => {} } = {}) {
  const entries = new Map(), queue = [];
  let running = false, timer, nextAt = 0;
  function entry(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("Invalid preview id");
    let item = entries.get(id);
    if (item) return item;
    if (entries.size >= 32) throw new Error("Preview cache capacity reached");
    item = { id, at: 0, requested: 0, retryAt: 0 };
    if (directory) {
      try {
        const file = join(directory, `${id}.jpg`), data = readFileSync(file);
        if (validJpeg(data) && validImage(data)) { item.data = data; item.at = statSync(file).mtimeMs; }
      } catch { /* First use has no persisted still. */ }
    }
    entries.set(id, item);
    return item;
  }
  function schedule(delay = 0) {
    if (running || timer || !queue.length) return;
    timer = setTimeout(() => { timer = undefined; void pump(); }, delay);
    timer.unref?.();
  }
  async function pump() {
    if (running || !queue.length) return;
    while (queue.length && now() - queue[0].requested > demandMs) {
      const expired = queue.shift(); expired.pending = undefined; expired.done?.();
    }
    if (!queue.length) return;
    if (now() < nextAt || !canRefresh()) {
      schedule(Math.max(1000, nextAt - now()));
      return;
    }
    const item = queue.shift();
    if (now() - item.requested > demandMs) {
      item.pending = undefined; item.done?.(); schedule(); return;
    }
    running = true;
    try {
      const data = await read(item.id);
      if (!validJpeg(data) || !validImage(data)) throw new Error("No usable preview JPEG");
      item.data = data; item.at = now(); item.error = false;
      if (directory) {
        try {
          mkdirSync(directory, { recursive: true, mode: 0o700 });
          const file = join(directory, `${item.id}.jpg`);
          writeFileSync(`${file}.tmp`, data, { mode: 0o600 });
          renameSync(`${file}.tmp`, file);
        } catch { log("preview persistence failed; retaining memory copy"); }
      }
      log(`preview refreshed; bytes=${data.length}; cached=${entries.size}`);
    } catch {
      item.error = true; item.retryAt = now() + 30000;
      log("preview refresh failed; retaining previous image");
    } finally {
      // The decoder exits first; SDK/go2rtc still need time to release the call.
      nextAt = now() + releaseMs;
      running = false; item.pending = undefined; item.done?.();
      schedule(releaseMs);
    }
  }
  async function snapshot(id) {
    const item = entry(id);
    item.requested = now();
    if ((!item.data || now() - item.at >= freshMs) && !item.pending && now() >= item.retryAt) {
      item.pending = new Promise(resolve => { item.done = resolve; });
      queue.push(item); schedule();
    }
    if (!item.data && item.pending) {
      let wait;
      await Promise.race([item.pending, new Promise(resolve => { wait = setTimeout(resolve, coldWaitMs); })]);
      clearTimeout(wait);
    }
    if (!item.data) throw new Error("Preview is warming up; retry later");
    return item.data;
  }
  snapshot.status = () => ({ running, queued: queue.length, entries: [...entries.values()].map(item => ({
    id: item.id, updatedAt: item.at ? new Date(item.at).toISOString() : null,
    ageSeconds: item.at ? Math.max(0, Math.round((now() - item.at) / 1000)) : null,
    bytes: item.data?.length ?? 0, pending: !!item.pending, refreshFailed: !!item.error,
  })) });
  return snapshot;
}

function validJpeg(data) {
  return Buffer.isBuffer(data) && data.length >= 4 && data.length <= 8 * 1024 * 1024
    && data.readUInt16BE(0) === 0xffd8 && data.readUInt16BE(data.length - 2) === 0xffd9;
}
