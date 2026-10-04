import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGo2rtcConfig } from "../go2rtc-config.mjs";
import { nvrStreams } from "../src/nvr-media.mjs";

test(
  "NVR MPEG-TS audio survives the actual go2rtc RTSP publication",
  { skip: process.platform === "win32", timeout: 45000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "nvr-rtsp-"));
    const children = new Set();
    const start = (bin, args) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      children.add(child);
      child.once("close", () => children.delete(child));
      return child;
    };
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "video/mp2t" });
      const generator = start("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-re",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=128x96:rate=15",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=16000",
        "-t",
        "35",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-g",
        "15",
        "-c:a",
        "aac",
        "-ac",
        "1",
        "-f",
        "mpegts",
        "pipe:1",
      ]);
      generator.stderr.resume();
      generator.stdout.pipe(res);
      res.once("close", () => generator.kill("SIGKILL"));
    });
    let logs = "";
    try {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const config = join(dir, "go2rtc.yaml");
      await writeGo2rtcConfig(
        {
          selfHost: "127.0.0.1",
          port: server.address().port,
          go2rtcConfig: config,
        },
        [
          {
            sn: "SYNTHETIC",
            stream: "/stream/SYNTHETIC",
            streams: nvrStreams("SYNTHETIC", "T8E00"),
          },
        ],
      );
      assert.match(
        await readFile(config, "utf8"),
        /#video=copy#audio=aac#async/,
      );
      const relay = start("go2rtc", ["-config", config]);
      relay.stdout.on("data", (b) => {
        logs += b.toString();
      });
      relay.stderr.on("data", (b) => {
        logs += b.toString();
      });
      for (let i = 0; i < 50; i++) {
        if (logs.includes("listen addr=:8554")) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const probe = start("ffprobe", [
        "-v",
        "error",
        "-rtsp_transport",
        "tcp",
        "-analyzeduration",
        "2000000",
        "-probesize",
        "262144",
        "-show_entries",
        "stream=codec_type,codec_name",
        "-of",
        "json",
        "rtsp://127.0.0.1:8554/SYNTHETIC",
      ]);
      let output = "",
        errors = "";
      probe.stdout.on("data", (b) => {
        output += b.toString();
      });
      probe.stderr.on("data", (b) => {
        errors += b.toString();
      });
      const timeout = setTimeout(() => probe.kill("SIGKILL"), 25000);
      const code = await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.once("close", resolve);
      });
      clearTimeout(timeout);
      assert.equal(code, 0, errors + logs);
      const streams = JSON.parse(output).streams;
      assert.ok(
        streams.some((s) => s.codec_type === "video"),
        output,
      );
      assert.ok(
        streams.some((s) => s.codec_name === "aac"),
        output,
      );
      assert.doesNotMatch(logs, /AAC with no global headers/);
    } finally {
      for (const child of children) child.kill("SIGKILL");
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
