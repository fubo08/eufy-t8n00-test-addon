import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createSnapshotReader } from "../src/nvr-snapshot.mjs";

function fixture(timeoutMs = 1000) {
  const children = [];
  const read = createSnapshotReader({ timeoutMs, spawnProcess(bin, args) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.kill = () => { child.killed = true; };
    children.push({ child, bin, args });
    return child;
  } });
  return { read, children };
}
test("concurrent snapshots share a decoder but lenses stay separate", async () => {
  const { read, children } = fixture();
  const a = read("CAM1"), b = read("CAM1"), c = read("CAM1_fixed");
  assert.equal(a, b);
  assert.equal(children.length, 2);
  for (const { child, args } of children) {
    assert.ok(args.some(x => x.startsWith("rtsp://127.0.0.1:8554/")));
    assert.equal(args[args.indexOf("-skip_frame") + 1], "nokey");
    assert.equal(args[args.indexOf("-err_detect") + 1], "explode");
    assert.ok(args.indexOf("-skip_frame") < args.indexOf("-i"));
    assert.equal(args[args.indexOf("-analyzeduration") + 1], "500000");
    assert.ok(args.indexOf("-analyzeduration") < args.indexOf("-i"));
    child.stdout.write(Buffer.from([255, 216, 1, 2, 255, 217]));
    child.emit("close", 0);
  }
  await Promise.all([a, b, c]);
  const next = read("CAM1");
  assert.equal(children.length, 3);
  const check = assert.rejects(next, /complete JPEG/);
  children[2].child.emit("close", 0);
  await check;
});
test("timeout kills the decoder and permits retry", async () => {
  const { read, children } = fixture(10);
  await assert.rejects(read("CAM1"), /timed out/);
  assert.equal(children[0].child.killed, true);
  const next = read("CAM1");
  const check = assert.rejects(next, /could not start/);
  children[1].child.emit("error", new Error("synthetic"));
  await check;
});
test("oversized output is stopped and invalid ids never spawn", async () => {
  const { read, children } = fixture();
  await assert.rejects(read("../invalid"), /Invalid/);
  assert.equal(children.length, 0);
  const pending = read("CAM1");
  const check = assert.rejects(pending, /8 MiB/);
  children[0].child.stdout.write(Buffer.alloc(8 * 1024 * 1024 + 1));
  await check;
  assert.equal(children[0].child.killed, true);
});
