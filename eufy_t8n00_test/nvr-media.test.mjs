import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, spawnSync } from "node:child_process";
import {
  nvrStreams,
  audioInput,
  createNvrHandler,
  muxArgs,
} from "../src/nvr-media.mjs";

test("a busy NVR is not retried by every lens and snapshot request", async () => {
  let opens = 0;
  const dev = {
    describe: () => ({ model: "T8E00" }),
    camera: () => ({
      openReadable: async () => {
        opens++;
        throw new Error("RTC synthetic scall answered 486");
      },
    }),
  };
  const handler = createNvrHandler({
    cfg: {},
    eufy: { getDevice: async () => dev },
    streamClientFor: async () => ({ getDevice: async () => dev }),
  });
  function response() {
    const res = new EventEmitter();
    res.writeHead = (status, headers) => {
      res.status = status;
      res.headers = headers;
    };
    res.end = () => {};
    return res;
  }
  const first = response();
  await handler({}, first, new URL("http://bridge/nvr-stream/CAM1/1"));
  assert.equal(first.status, 502);
  for (const path of [
    "nvr-stream/CAM1/0",
    "nvr-stream/CAM1/1",
    "nvr-snapshot/CAM1/0",
  ]) {
    const res = response();
    await handler({}, res, new URL(`http://bridge/${path}`));
    assert.equal(res.status, 503);
    assert.ok(Number(res.headers["retry-after"]) > 0);
  }
  assert.equal(opens, 1);
});

test(
  "Linux ffmpeg produces video and audible AAC from camera-like inputs",
  { skip: process.platform === "win32", timeout: 20000 },
  async () => {
    const generate = (args) => {
      const r = spawnSync(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", ...args, "pipe:1"],
        { maxBuffer: 8 * 1024 * 1024 },
      );
      assert.equal(r.status, 0, r.stderr?.toString());
      return r.stdout;
    };
    const video = generate([
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=128x96:rate=15",
      "-t",
      "3",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-f",
      "h264",
    ]);
    const audio = generate([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=16000",
      "-t",
      "3",
      "-ac",
      "1",
      "-f",
      "alaw",
    ]);
    const proc = spawn("ffmpeg", muxArgs(audioInput({ codec: "g711a" })), {
      stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
    });
    const output = [],
      errors = [];
    proc.stdout.on("data", (b) => output.push(b));
    proc.stderr.on("data", (b) => errors.push(b));
    const ended = new Promise((resolve, reject) => {
      proc.on("error", reject);
      proc.on("close", resolve);
    });
    proc.stdio[3].end(video);
    proc.stdio[4].end(audio);
    assert.equal(await ended, 0, Buffer.concat(errors).toString());
    const probe = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name",
        "-of",
        "json",
        "pipe:0",
      ],
      { input: Buffer.concat(output) },
    );
    assert.equal(probe.status, 0, probe.stderr?.toString());
    const streams = JSON.parse(probe.stdout).streams;
    assert.ok(streams.some((s) => s.codec_type === "video"));
    assert.ok(streams.some((s) => s.codec_name === "aac"));
  },
);

test("S4 streams retain the primary ID and isolate the fixed lens", () => {
  assert.deepEqual(
    nvrStreams("CAM1", "T8E00").map((s) => [s.id, s.sensor]),
    [
      ["CAM1", 1],
      ["CAM1_fixed", 0],
    ],
  );
  assert.equal(nvrStreams("CAM1", "T8P00"), undefined);
  assert.deepEqual(audioInput({ codec: "g711a" }), [
    "-f",
    "alaw",
    "-ar",
    "16000",
    "-ac",
    "1",
  ]);
  assert.equal(
    audioInput({ codec: "aac-eld", data: Buffer.alloc(8) }),
    undefined,
  );
  assert.equal(
    audioInput({ codec: "aac-lc", data: Buffer.alloc(8) }),
    undefined,
  );
  assert.deepEqual(
    audioInput({
      codec: "aac-lc",
      data: Buffer.from([255, 241, 0, 0, 0, 0, 0, 0]),
    }),
    ["-f", "aac"],
  );
});

test("silent camera starts video and disconnect stops the RTC pull", async () => {
  const feed = new PassThrough();
  let options;
  const dev = {
    describe: () => ({ model: "T8E00" }),
    camera: () => ({
      openReadable: async (o) => {
        options = o;
        return feed;
      },
    }),
  };
  const handler = createNvrHandler({
    cfg: {},
    eufy: { getDevice: async () => dev },
    streamClientFor: async () => ({ getDevice: async () => dev }),
  });
  const response = new PassThrough();
  response.writeHead = (code, headers) => {
    response.status = code;
    response.headers = headers;
  };
  const chunks = [];
  response.on("data", (data) => chunks.push(data));
  await handler(
    new EventEmitter(),
    response,
    new URL("http://bridge/nvr-stream/CAM1/0"),
  );
  assert.equal(options.sensor, 0);
  feed.write(Buffer.from([0, 0, 0, 1, 0x40]));
  await new Promise((resolve) => setTimeout(resolve, 1300));
  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/octet-stream");
  assert.deepEqual(Buffer.concat(chunks), Buffer.from([0, 0, 0, 1, 0x40]));
  response.destroy();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(options.signal.aborted, true);
  assert.equal(feed.destroyed, true);
});

test("disconnect during camera lookup does not start a stream", async () => {
  let release;
  let opened = false;
  const handler = createNvrHandler({
    cfg: {},
    eufy: {
      getDevice: () =>
        new Promise((r) => {
          release = r;
        }),
    },
    streamClientFor: async () => {
      opened = true;
    },
  });
  const response = new EventEmitter();
  const pending = handler(
    new EventEmitter(),
    response,
    new URL("http://bridge/nvr-stream/CAM1/1"),
  );
  response.emit("close");
  release({ describe: () => ({ model: "T8E00" }) });
  await pending;
  assert.equal(opened, false);
});

test("closing one lens keeps the other lens registered as streaming", async () => {
  const feeds = [];
  const state = { streaming: new Set() };
  const events = [];
  const dev = {
    describe: () => ({ model: "T8E00" }),
    camera: () => ({
      openReadable: async () => {
        const feed = new PassThrough();
        feeds.push(feed);
        return feed;
      },
    }),
  };
  const handler = createNvrHandler({
    cfg: {},
    state,
    broadcast: (e) => events.push(e),
    eufy: { getDevice: async () => dev },
    streamClientFor: async () => ({ getDevice: async () => dev }),
  });
  const a = new EventEmitter(),
    b = new EventEmitter();
  await handler({}, a, new URL("http://bridge/nvr-stream/CAM1/0"));
  await handler({}, b, new URL("http://bridge/nvr-stream/CAM1/1"));
  a.emit("close");
  assert.equal(state.streaming.has("CAM1"), true);
  assert.equal(feeds[0].destroyed, true);
  assert.equal(feeds[1].destroyed, false);
  b.emit("close");
  assert.equal(state.streaming.has("CAM1"), false);
  assert.deepEqual(
    events.map((e) => e.active),
    [true, false],
  );
});

test("snapshot failure does not delay either live lens", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 500 }));
  const sensors = [];
  const messages = [];
  const dev = {
    describe: () => ({ model: "T8E00" }),
    camera: () => ({ openReadable: async ({ sensor }) => {
      sensors.push(sensor);
      return new PassThrough();
    } }),
  };
  const handler = createNvrHandler({
    cfg: {}, eufy: { getDevice: async () => dev },
    streamClientFor: async () => ({ getDevice: async () => dev }),
    eventLog: (message) => messages.push(message),
  });
  const snapshot = new EventEmitter();
  snapshot.writeHead = (status) => { snapshot.status = status; };
  snapshot.end = () => {};
  await handler({}, snapshot, new URL("http://bridge/nvr-snapshot/CAM1/0"));
  assert.equal(snapshot.status, 502);
  assert.ok(messages.some((m) => m.includes("snapshot failed: snapshot HTTP 500")));
  for (const sensor of [0, 1]) {
    const res = new EventEmitter();
    t.after(() => res.emit("close"));
    await handler({}, res, new URL(`http://bridge/nvr-stream/CAM1/${sensor}`));
    res.emit("close");
  }
  assert.deepEqual(sensors, [0, 1]);
});

test("simultaneous lenses hydrate one client while retaining separate RTC pulls", async (t) => {
  let opens = 0;
  let release;
  const hydrated = new Promise((resolve) => { release = resolve; });
  const sensors = [];
  const dev = {
    describe: () => ({ model: "T8E00" }),
    camera: () => ({ openReadable: async ({ sensor }) => {
      sensors.push(sensor);
      return new PassThrough();
    } }),
  };
  const handler = createNvrHandler({
    cfg: {}, eufy: { getDevice: async () => dev },
    streamClientFor: async () => { opens++; await hydrated; return { getDevice: async () => dev }; },
  });
  const responses = [new EventEmitter(), new EventEmitter()];
  t.after(() => responses.forEach((res) => res.emit("close")));
  const pulls = responses.map((res, sensor) => handler({}, res, new URL(`http://bridge/nvr-stream/CAM1/${sensor}`)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opens, 1);
  release();
  await Promise.all(pulls);
  assert.deepEqual(sensors.sort(), [0, 1]);
});
