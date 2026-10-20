import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import { createHttpHandler } from "../src/http-routes.mjs";
import { createPreviewCache } from "../src/nvr-preview-cache.mjs";

test("production HTTP snapshot callers serialize seven S4/E40 views, including legacy E40 URLs", async () => {
  let active = 0, peak = 0;
  const captured = [];
  const read = createPreviewCache({ releaseMs: 2, coldWaitMs: 2000, read: async id => {
    captured.push(id); active++; peak = Math.max(peak, active);
    await wait(2); active--;
    return Buffer.from([255, 216, id.endsWith("fixed") ? 1 : 2, 255, 217]);
  } });
  const handler = createHttpHandler({ cfg: {}, state: { flags: { ready: true } }, readSnapshot: read,
    eufy: { getDevice: async sn => ({ describe: () => ({ model: sn.startsWith("S4") ? "T8E00" : "T8P00" }) }) } });
  async function request(path) {
    const res = new EventEmitter();
    res.writeHead = status => { res.status = status; };
    res.end = body => { res.body = body; };
    await handler({ url: path, headers: { host: "bridge.invalid" } }, res);
    return res;
  }
  const paths = ["/nvr-snapshot/S4_A/0", "/nvr-snapshot/S4_A/1", "/nvr-snapshot/S4_B/0",
    "/nvr-snapshot/S4_B/1", "/snapshot/E40_A", "/snapshot/E40_B?mode=auto", "/snapshot/E40_C?mode=live"];
  const responses = await Promise.all([...paths, ...paths].map(request));
  responses.forEach(res => assert.equal(res.status, 200));
  assert.equal(peak, 1); assert.equal(captured.length, 7);
  assert.ok(captured.includes("S4_A_fixed")); assert.ok(captured.includes("S4_A"));
  assert.equal((await request("/snapshot/E40_A?mode=invalid")).status, 400);
  assert.equal((await request("/snapshot/E40_A?mode=auto&mode=live")).status, 400);
  const status = await request("/nvr-preview-status");
  assert.equal(JSON.parse(status.body).entries.length, 7);
});
