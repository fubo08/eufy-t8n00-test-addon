import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { createPreviewCache } from "../src/nvr-preview-cache.mjs";
const jpeg = tag => Buffer.from([255, 216, tag, 255, 217]);
const until = async predicate => {
  for (let i = 0; i < 100 && !predicate(); i++) await wait(5);
  assert.ok(predicate());
};

test("seven requested lenses serialize acquisition and coalesce duplicate callers", async () => {
  let active = 0, peak = 0, calls = 0;
  const cache = createPreviewCache({ releaseMs: 8, coldWaitMs: 2000,
    read: async id => { active++; peak = Math.max(peak, active); calls++;
      await wait(5); active--; return jpeg(id.length); } });
  const ids = ["S4_A", "S4_A_fixed", "S4_B", "S4_B_fixed", "E40_A", "E40_B", "E40_C"];
  const images = await Promise.all([...ids, ...ids].map(cache));
  assert.equal(calls, 7); assert.equal(peak, 1);
  images.forEach((image, index) => assert.deepEqual(image, jpeg(ids[index % 7].length)));
  await cache(ids[0]); assert.equal(calls, 7);
});

test("stale preview is immediate, failed refresh retains it, and a later refresh advances it", async () => {
  let clock = 100000, calls = 0;
  const cache = createPreviewCache({ now: () => clock, freshMs: 100, releaseMs: 0,
    read: async () => { calls++; if (calls === 2) throw new Error("offline"); return jpeg(calls); } });
  assert.deepEqual(await cache("S4_A_fixed"), jpeg(1));
  clock += 101;
  assert.deepEqual(await cache("S4_A_fixed"), jpeg(1));
  await until(() => cache.status().entries[0].refreshFailed);
  assert.deepEqual(await cache("S4_A_fixed"), jpeg(1)); assert.equal(calls, 2);
  clock += 30001;
  await cache("S4_A_fixed");
  await until(() => cache.status().entries[0].bytes && !cache.status().entries[0].pending);
  assert.deepEqual(await cache("S4_A_fixed"), jpeg(3));
});

test("persisted cache survives restart and never substitutes the other lens", async t => {
  const directory = mkdtempSync(join(tmpdir(), "nvr-preview-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = createPreviewCache({ directory, releaseMs: 0, read: async id => jpeg(id.endsWith("fixed") ? 1 : 2) });
  await first("S4_A"); await first("S4_A_fixed");
  const restored = createPreviewCache({ directory, read: async () => { assert.fail("must not reopen fresh cached stream"); } });
  assert.deepEqual(await restored("S4_A"), jpeg(2));
  assert.deepEqual(await restored("S4_A_fixed"), jpeg(1));
});

test("cold requests are bounded and invalid output or traversal is never cached", async () => {
  let release;
  const cache = createPreviewCache({ coldWaitMs: 10, releaseMs: 0,
    read: () => new Promise(resolve => { release = resolve; }) });
  await assert.rejects(cache("../bad"), /Invalid/);
  await assert.rejects(cache("E40_A"), /warming up/);
  release(Buffer.from("invalid"));
  await until(() => !cache.status().running);
  assert.equal(cache.status().entries[0].bytes, 0);
});

test("live-slot pressure defers new stills and abandoned requests expire", async () => {
  let clock = 100000, allowed = false, calls = 0;
  const cache = createPreviewCache({ now: () => clock, coldWaitMs: 5, demandMs: 10,
    canRefresh: () => allowed, read: async () => { calls++; return jpeg(1); } });
  await assert.rejects(cache("E40_A"), /warming up/);
  assert.equal(calls, 0);
  clock += 11; allowed = true;
  await until(() => cache.status().queued === 0).catch(async () => {
    await wait(600); assert.equal(cache.status().queued, 0);
  });
  assert.equal(calls, 0);
});
