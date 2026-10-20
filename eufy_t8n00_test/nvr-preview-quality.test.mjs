import { test } from "node:test";
import assert from "node:assert/strict";
import jpeg from "jpeg-js";
import { hasPreviewDetail } from "../src/nvr-preview-quality.mjs";
import { createPreviewCache } from "../src/nvr-preview-cache.mjs";
import { setTimeout as wait } from "node:timers/promises";
function picture(flat) {
  const width = 128, height = 96, data = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = flat ? 128 : ((x + y) % 32 < 16 ? 90 : 160);
    const p = (y * width + x) * 4; data[p] = value; data[p + 1] = value; data[p + 2] = value;
  }
  return jpeg.encode({ width, height, data }, 80).data;
}
test("complete JPEG syntax alone does not distinguish a gray concealed frame from an IR scene", () => {
  assert.equal(hasPreviewDetail(picture(true)), false);
  assert.equal(hasPreviewDetail(picture(false)), true);
  assert.equal(hasPreviewDetail(Buffer.from([255, 216, 255, 217])), false);
});
test("production image validator retains the prior scene when the decoder returns a complete gray JPEG", async () => {
  let clock = 100000, calls = 0;
  const good = picture(false), gray = picture(true);
  const cache = createPreviewCache({ now: () => clock, freshMs: 10, releaseMs: 0,
    validImage: hasPreviewDetail, read: async () => ++calls === 1 ? good : gray });
  assert.deepEqual(await cache("S4_PRIMARY"), good);
  clock += 11; assert.deepEqual(await cache("S4_PRIMARY"), good);
  for (let i = 0; i < 20 && !cache.status().entries[0].refreshFailed; i++) await wait(5);
  assert.equal(cache.status().entries[0].refreshFailed, true);
  assert.deepEqual(await cache("S4_PRIMARY"), good);
  assert.equal(cache.status().entries[0].ageSeconds, 0);
  assert.equal(cache.status().entries[0].updatedAt, new Date(100000).toISOString());
});
