// My isolated vendor-grid experiment; not an SDK fix or production media path.
// Created with Codex.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { openBetaLiveFeed } from "./nvr-beta-live-feed.mjs";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function gridStart(packet, views, resolution) {
  if (packet.length < 16 || packet.toString("ascii", 0, 4) !== "XZYH") return packet;
  if (packet.readUInt16LE(4) !== 1350) return packet;
  const command = JSON.parse(packet.subarray(16).toString("utf8"));
  if (command.cmd !== 1003) return packet;
  if (packet.readUInt32LE(6) !== packet.length - 16 || command.payload?.play_id !== 1
      || command.payload?.chn_list?.length !== 1) throw new Error("unexpected_sdk_start");
  if (views.length !== 7 || !views.every(v => Number.isInteger(v.channel) && v.channel >= 0 && v.channel < 255
      && [0, 1].includes(v.view))) throw new Error("invalid_grid_views");
  if (![1920, 3840].includes(resolution.width) || resolution.height !== resolution.width * 9 / 16)
    throw new Error("invalid_grid_resolution");
  // Current vendor portal: 3 means a 3x3 stitched layout, not three calls.
  command.payload.chn_list = views.map((v, index) => ({ index, chn: v.channel, sensor: v.view, isUps: 0, isClicked: index === 0 }));
  command.payload.stitch_mode = 3;
  command.payload.stitch_resolution = resolution;
  command.payload.audio_chn = views[0].channel;
  const body = Buffer.from(JSON.stringify(command));
  const header = Buffer.from(packet.subarray(0, 16)); header.writeUInt32LE(body.length, 6);
  return Buffer.concat([header, body]);
}

async function measure(camera, durationMs = 25000) {
  const result = { videoPackets: 0, audioPackets: 0, decodedSamples: 0, decoderErrors: 0 };
  const cells = Array.from({ length: 9 }, () => ({ hashes: new Set(), maxStdDev: 0 }));
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), durationMs);
  let feed, decoder, decoderDone, remainder = Buffer.alloc(0);
  try {
    feed = await openBetaLiveFeed(camera, { signal: abort.signal, onAudio: () => result.audioPackets++ });
    for await (const frame of feed) {
      result.videoPackets++; result.codec = frame.codec; result.width = frame.width; result.height = frame.height;
      if (!decoder) {
        if (frame.codec !== "h265") throw new Error("unexpected_codec");
        decoder = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-threads", "2", "-f", "hevc", "-i", "pipe:0",
          "-an", "-vf", "fps=1,scale=96:54", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"], { stdio: ["pipe", "pipe", "pipe"] });
        decoder.stdin.on("error", () => {});
        decoder.stderr.on("data", () => result.decoderErrors++);
        decoderDone = new Promise(resolve => {
          decoder.on("error", () => { result.decoderFailed = true; resolve(); });
          decoder.on("close", code => { result.decoderExit = code; resolve(); });
        });
        decoder.stdout.on("data", data => {
          remainder = Buffer.concat([remainder, data]);
          while (remainder.length >= 5184) {
            const image = remainder.subarray(0, 5184); remainder = remainder.subarray(5184); result.decodedSamples++;
            cells.forEach((cell, index) => {
              const tile = Buffer.alloc(576), left = index % 3 * 32, top = Math.floor(index / 3) * 18;
              for (let row = 0; row < 18; row++) image.copy(tile, row * 32, (top + row) * 96 + left, (top + row) * 96 + left + 32);
              const mean = tile.reduce((a, b) => a + b, 0) / tile.length;
              const variance = tile.reduce((a, b) => a + (b - mean) ** 2, 0) / tile.length;
              cell.maxStdDev = Math.max(cell.maxStdDev, Math.sqrt(variance));
              cell.hashes.add(createHash("sha256").update(tile).digest("hex"));
            });
          }
        });
      }
      if (!decoder.stdin.write(frame.data)) await new Promise(resolve => {
        const done = () => { decoder.stdin.off("drain", done); abort.signal.removeEventListener("abort", done); resolve(); };
        decoder.stdin.once("drain", done); abort.signal.addEventListener("abort", done, { once: true });
        if (abort.signal.aborted) done();
      });
    }
  } catch { if (!abort.signal.aborted) result.streamFailed = true; }
  finally {
    clearTimeout(timer); feed?.destroy();
    if (decoder) {
      decoder.stdin.end(); const kill = setTimeout(() => decoder.kill("SIGKILL"), 5000);
      await decoderDone; clearTimeout(kill);
    }
  }
  result.cells = cells.map((cell, index) => ({ index, distinctSamples: cell.hashes.size, maxStdDev: Math.round(cell.maxStdDev * 10) / 10 }));
  return result;
}

export async function qualifyGrid(sdk, saved, options) {
  if (!sdk.isSessionValid(saved)) throw new Error("cached_session_unusable");
  const store = new sdk.MemorySessionStore(); store.save(structuredClone(saved));
  const client = new sdk.EufyMega({ email: options.email, countryCode: options.country, store,
    autoRealtime: false, pollMs: 0, storedSnapshotCache: false, logger: { debug() {}, info() {}, warn() {}, error() {} } });
  client.on("error", () => {});
  const report = { sdkVersion: "0.5.0-beta.74", revision: "425c877c4f684e1b54318b03ed7451c0c4a90593",
    testBridgeVersion: "0.3.38", experimentalWireOverride: true, runs: [], status: "started" };
  const original = client.rtc.newSession;
  let views, run;
  try {
    const login = await client.login();
    if (login.status !== sdk.LoginStatus.Ok || login.session?.raw?.restored !== true) throw new Error("cached_session_not_restored");
    const devices = await client.getDevices(), hubs = devices.filter(d => d.model === "T8N00");
    if (hubs.length !== 1 || typeof original !== "function") throw new Error("unexpected_sdk_topology");
    const cameras = devices.filter(d => ["T8E00", "T8P00"].includes(d.model) && d.stationSn === hubs[0].sn).sort((a, b) => a.channel - b.channel);
    views = cameras.flatMap(d => (d.model === "T8E00" ? [0, 1] : [0]).map(view => ({ channel: d.channel, view })));
    if (cameras.length !== 5 || views.length !== 7) throw new Error("expected_seven_views");
    // Instrument only the isolated process. No SDK source, persisted session,
    // camera setting or production route is changed.
    client.rtc.newSession = function (...args) {
      const session = original.apply(this, args), send = session.sendCommand.bind(session);
      run.sessions++;
      session.sendCommand = packet => {
        const changed = gridStart(packet, views, run.resolution);
        if (changed !== packet) run.starts++;
        return send(changed);
      };
      session.on("mediaData", packet => {
        if (packet.length >= 38 && packet.readUInt16LE(4) === 1300) {
          const key = `${packet[12]}:${packet.readUInt16LE(26)}x${packet.readUInt16LE(28)}`;
          run.mediaLayouts[key] = (run.mediaLayouts[key] ?? 0) + 1;
        }
      });
      return session;
    };
    const camera = (await client.getDevice(cameras[0].sn)).camera();
    for (const width of [3840, 1920]) {
      run = { resolution: { width, height: width * 9 / 16 }, sessions: 0, starts: 0, mediaLayouts: {} };
      report.runs.push(run); Object.assign(run, await measure(camera));
      if (run.decodedSamples >= 5 && run.decoderExit === 0 && !run.streamFailed) break;
      await pause(10000);
    }
    report.status = report.runs.some(r => r.decodedSamples >= 5 && r.decoderExit === 0 && !r.streamFailed) ? "grid_media_observed" : "no_usable_grid";
    report.limits = "Experimental outgoing 1003 override based on current vendor portal, not unmodified SDK validation. Composite decode and per-tile variation are not proof of seven independent full-resolution streams, visual camera identity, audible sound, or browser playback.";
    return report;
  } finally { client.rtc.newSession = original; await client.disconnect(); }
}

export async function main() {
  const options = JSON.parse(readFileSync("/data/options.json", "utf8"));
  if (options.qualify_nvr_grid !== true) return;
  const path = "/data/qualification-grid-beta74-v1.json";
  if (existsSync(path)) { console.info("[grid-qualification] Already attempted; skipping."); return; }
  let report = { status: "started", timestamp: new Date().toISOString() };
  const save = () => writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 }); save();
  const timer = setTimeout(() => { report.status = "timeout"; save(); console.info("[grid-qualification] " + JSON.stringify(report)); process.exit(1); }, 120000);
  try {
    const sdk = await import("/capacity-qualification/sdk/dist/index.js");
    report = { ...report, ...await qualifyGrid(sdk, JSON.parse(readFileSync("/data/.eufy-session.json", "utf8")), options) };
  } catch { report.status = "failed"; report.reason = "qualification_failed_without_sensitive_details"; }
  finally { clearTimeout(timer); save(); console.info("[grid-qualification] " + JSON.stringify(report)); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { await main(); process.exit(0); }
