import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGo2rtcConfig } from "../go2rtc-config.mjs";
import { nvrStreams } from "../src/nvr-media.mjs";
import { createSnapshotReader } from "../src/nvr-snapshot.mjs";

for (const [format, encoder, profile] of [["mpegts", "libx264", "original"], ["mp4", "libx264", "original"], ["mp4", "libx265", "original"], ["mp4", "libx265", "h264"]]) test(
  `NVR ${format} ${encoder} ${profile} audio and snapshot survive the actual go2rtc RTSP publication`,
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
      res.writeHead(200, { "content-type": format === "mp4" ? "video/mp4" : "video/mp2t" });
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
        encoder,
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        ...(encoder === "libx265" ? ["-x265-params", "pools=1:frame-threads=1:log-level=error"] : []),
        "-g",
        "15",
        "-c:a",
        "aac",
        "-ac",
        "1",
        "-f",
        format,
        ...(format === "mp4" ? ["-movflags", "frag_keyframe+empty_moov+default_base_moof"] : []),
        "pipe:1",
      ]);
      generator.stderr.resume();
      generator.stdout.pipe(res);
      res.once("close", () => generator.kill("SIGKILL"));
    });
    let logs = "";
    const previousProfile = process.env.EUFY_PLAYBACK_PROFILE;
    try {
      process.env.EUFY_PLAYBACK_PROFILE = profile;
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
        /#video=copy#audio=aac/,
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
        "stream=codec_type,codec_name:packet=codec_type,pts_time",
        "-show_packets",
        "-read_intervals",
        "%+4",
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
      const result = JSON.parse(output);
      const streams = result.streams;
      const times = result.packets.filter((p) => p.codec_type === "video").map((p) => Number(p.pts_time));
      assert.ok(times.length >= 20, `too few video packets: ${times.length}`);
      const deltas = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
      const median = deltas[Math.floor(deltas.length / 2)];
      assert.ok(median > 0.04 && median < 0.09, `15 fps source timing lost: median delta=${median}`);
      assert.ok(
        streams.some((s) => s.codec_type === "video"),
        output,
      );
      if (profile === "h264") {
        assert.ok(streams.some(s => s.codec_name === "h264"), output);
        // ffprobe may omit PTS on the first RTP packet before clock anchoring.
        // After that first packet, missing or backwards timestamps are failures.
        const anchored = Number.isFinite(times[0]) ? times : times.slice(1);
        assert.ok(anchored.every(Number.isFinite), `missing anchored PTS: ${JSON.stringify(times)}`);
        assert.ok(anchored.slice(1).every((t, i) => t > anchored[i]), `video timestamps must strictly increase: ${JSON.stringify(times)}`);
        assert.match(await readFile(config, "utf8"), /SYNTHETIC_original:/);
      }
      assert.ok(
        streams.some((s) => s.codec_name === "aac"),
        output,
      );
      assert.doesNotMatch(logs, /AAC with no global headers/);
      const jpeg = await createSnapshotReader()("SYNTHETIC");
      assert.equal(jpeg.readUInt16BE(0), 0xffd8);
      assert.equal(jpeg.readUInt16BE(jpeg.length - 2), 0xffd9);
    } finally {
      if (previousProfile === undefined) delete process.env.EUFY_PLAYBACK_PROFILE;
      else process.env.EUFY_PLAYBACK_PROFILE = previousProfile;
      for (const child of children) child.kill("SIGKILL");
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
