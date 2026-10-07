import { spawn } from "node:child_process";
import { createMediaPacer } from "./media-pacer.mjs";
import { createStartQueue, configuredStartSpacing } from "./nvr-start-queue.mjs";
import { createSnapshotReader } from "./nvr-snapshot.mjs";

// Read only MP4 container headers; never inspect or log encoded media bytes.
export function fragmentClocks(data) {
  const clocks = [];
  const walk = (start, end, track = 0) => {
    for (let pos = start; pos + 8 <= end;) {
      const size = data.readUInt32BE(pos);
      if (size < 8 || pos + size > end) return;
      const type = data.toString("ascii", pos + 4, pos + 8);
      if (type === "moof" || type === "traf") walk(pos + 8, pos + size);
      if (type === "tfhd" && size >= 16) track = data.readUInt32BE(pos + 12);
      if (type === "tfdt" && track && size >= 16) {
        if (data[pos + 8] === 0) clocks.push([track, data.readUInt32BE(pos + 12)]);
        else if (data[pos + 8] === 1 && size >= 20) clocks.push([track, Number(data.readBigUInt64BE(pos + 12))]);
      }
      pos += size;
    }
  };
  walk(0, data.length);
  return clocks;
}

export function nvrStreams(sn, model) {
  return model === "T8E00"
    ? [
        {
          id: sn,
          sensor: 1,
          name: "Movable",
          snapshot: `/nvr-snapshot/${sn}/1`,
        },
        {
          id: `${sn}_fixed`,
          sensor: 0,
          name: "Fixed",
          snapshot: `/nvr-snapshot/${sn}/0`,
        },
      ]
    : undefined;
}

// Never guess AAC framing/configuration: raw AAC-ELD needs additional decoder metadata.
export function audioInput(frame) {
  if (frame?.codec === "g711a")
    return ["-f", "alaw", "-ar", "16000", "-ac", "1"];
  if (
    frame?.codec === "aac-lc" &&
    frame.data.length > 7 &&
    frame.data[0] === 255 &&
    (frame.data[1] & 0xf6) === 0xf0
  )
    return ["-f", "aac"];
  return undefined;
}

export function muxArgs(audio) {
  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-fflags",
    "+genpts",
    "-use_wallclock_as_timestamps",
    "1",
    "-analyzeduration",
    "1000000",
    "-probesize",
    "262144",
    "-i",
    "pipe:3",
    ...audio,
    "-i",
    "pipe:4",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-flush_packets",
    "1",
    "-f",
    "mpegts",
    "pipe:1",
  ];
}

export function createNvrHandler(ctx) {
  const readSnapshot = ctx.readSnapshot ?? createSnapshotReader();
  const startQueue = createStartQueue(configuredStartSpacing(process.env.EUFY_RTC_START_SPACING_MS));
  const viewers = new Map();
  // A failed lens must not make go2rtc hammer its sibling's NVR session, too.
  const retryAt = new Map();
  const opening = new Set();
  // Both lenses share the stream client. Coalesce hydration, not RTC pulls.
  const pendingClients = new Map();
  const openClient =
    ctx.streamClientFor ??
    (async (...args) =>
      (await import("../streams.mjs")).streamClientFor(...args));
  return async function handleNvr(req, res, url) {
    const match = /^\/nvr-(stream|snapshot)\/([A-Za-z0-9_-]+)\/([01])$/.exec(
      url.pathname,
    );
    if (!match) {
      res.writeHead(400);
      res.end("Invalid NVR media path");
      return;
    }
    const requestStarted = performance.now();
    const [, kind, sn, sensorText] = match;
    const sensor = Number(sensorText);
    const pullKey = `${sn}/${sensor}`;
    const remaining = (retryAt.get(sn) ?? 0) - Date.now();
    if (remaining > 0 || (kind === "stream" && opening.has(pullKey))) {
      res.writeHead(503, {
        "retry-after": String(Math.max(1, Math.ceil(remaining / 1000))),
      });
      res.end("NVR stream cooling down; retry later");
      return;
    }
    const abort = new AbortController();
    let feed, sourceFeed, mux, timer, outputTimer, audioPipe, timedMux, emitFragment, pacer;
    let audioQueue = [],
      audioBytes = 0,
      firstAudio,
      selecting = true,
      stopped = false;
    let registered = false;
    let ownsOpening = false;
    const log = (message) =>
      ctx.eventLog?.(`[nvr:media] sensor ${sensor}: ${message}`);
    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      if (ownsOpening) opening.delete(pullKey);
      clearTimeout(timer);
      clearTimeout(outputTimer);
      abort.abort();
      pacer?.close();
      feed?.destroy();
      sourceFeed?.destroy();
      if (registered) {
        const remaining = (viewers.get(sn) ?? 1) - 1;
        if (remaining) viewers.set(sn, remaining);
        else {
          viewers.delete(sn);
          ctx.state?.streaming?.delete(sn);
          ctx.broadcast?.({
            event: "streamState",
            deviceSn: sn,
            active: false,
          });
        }
      }
      audioQueue = [];
      audioPipe?.destroy();
      mux?.kill("SIGKILL");
    };
    res.once("close", cleanup);
    const fail = (error) => {
      if (stopped) return;
      // Abort is normal teardown. Real open/mux failures get a bounded retry pause.
      if (kind === "stream") {
        retryAt.set(
          sn,
          Date.now() + (/scall answered 486/.test(error.message) ? 30000 : 10000),
        );
      }
      log(`${kind} failed: ${error.message}; elapsedMs=${Math.round(performance.now() - requestStarted)}`);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end("NVR media unavailable");
      } else res.destroy();
      cleanup();
    };
    try {
      const device = await ctx.eufy.getDevice(sn);
      // E40 diagnostic access: keep dashboard routing unchanged until a sensor is verified.
      if (!nvrStreams(sn, device.describe().model) && device.describe().model !== "T8P00") {
        res.writeHead(404);
        res.end();
        cleanup();
        return;
      }
      if (stopped) return;
      if (kind === "snapshot") {
        const id = sensor === 1 ? sn : `${sn}_fixed`;
        const data = await readSnapshot(id);
        if (!stopped) {
          res.writeHead(200, {
            "content-type": "image/jpeg",
            "cache-control": "no-store",
          });
          res.end(data);
        }
        cleanup();
        return;
      }
      if (opening.has(pullKey)) {
        res.writeHead(503, { "retry-after": "1" });
        res.end("NVR stream is already opening");
        cleanup();
        return;
      }
      opening.add(pullKey);
      ownsOpening = true;
      let pending = pendingClients.get(sn);
      if (!pending) {
        pending = Promise.resolve().then(() => openClient(sn, ctx.cfg));
        pendingClients.set(sn, pending);
      }
      let client;
      try {
        client = await pending;
      } finally {
        if (pendingClients.get(sn) === pending) pendingClients.delete(sn);
      }
      if (stopped) return;
      const dev = await client.getDevice(sn);
      if (stopped) return;
      const openFeed = () => dev.camera().openReadable({
        sensor,
        objectMode: true,
        signal: abort.signal,
        onAudio(frame) {
          if (stopped) return;
          if (selecting) {
            firstAudio ??= frame;
            if (audioBytes + frame.data.length <= 512 * 1024) {
              audioQueue.push(frame);
              audioBytes += frame.data.length;
            }
          } else if (timedMux) {
            try {
              if (!Number.isSafeInteger(frame.timestampMs)) throw new Error("missing audio source timestamp");
              emitFragment(timedMux.pushAudio(frame, frame.timestampMs));
            } catch (error) { fail(error); }
          } else if (audioPipe && frame.codec === firstAudio.codec) {
            if (audioPipe.writableLength + frame.data.length > 512 * 1024) {
              fail(new Error("audio consumer too slow"));
              return;
            }
            audioPipe.write(frame.data);
          }
        },
      });
      const queuedAt = performance.now();
      feed = await (process.env.EUFY_RTC_VIDEO_SIGNALING_MODE === "call"
        ? startQueue(() => {
            log(`starting native call after ${Math.round(performance.now() - queuedAt)} ms in queue`);
            return openFeed();
          }, abort.signal)
        : openFeed());
      if (stopped) {
        feed.destroy();
        return;
      }
      log(`first frame ready after ${Math.round(performance.now() - requestStarted)} ms from request`);
      registered = true;
      opening.delete(pullKey);
      ownsOpening = false;
      const previous = viewers.get(sn) ?? 0;
      viewers.set(sn, previous + 1);
      ctx.state?.streaming?.add(sn);
      if (!previous)
        ctx.broadcast?.({ event: "streamState", deviceSn: sn, active: true });
      feed.on("error", fail);
      feed.once("close", () => {
        if (!stopped) {
          res.destroy();
          cleanup();
        }
      });
      feed.on("end", () => {
        res.end();
        cleanup();
      });
      // A missing microphone must not hold up video indefinitely.
      sourceFeed = feed;
      timer = setTimeout(async () => {
        // Use the SDK's existing muxer for the NVR's ADTS AAC. It retains
        // source timing instead of stamping buffered video at FFmpeg read time.
        if (firstAudio?.codec === "aac-lc" && audioInput(firstAudio) && Number.isSafeInteger(firstAudio.timestampMs)) {
          try {
            const { Fmp4Muxer } = await (ctx.loadMediaMuxer?.() ?? import("@mega-yfue/eufy-sdk"));
            if (stopped) return;
            timedMux = new Fmp4Muxer({ audio: true, fragmentSeconds: 0.25, keyframeAligned: false });
            let fragmentBytes = 0;
            let fragments = 0, lastOutput, maxOutputGapMs = 0, backwards = 0;
            const decodeHigh = new Map();
            const configuredDelay = Number(process.env.EUFY_MEDIA_BUFFER_MS ?? 1500);
            const delayMs = Number.isFinite(configuredDelay) ? Math.max(0, Math.min(3000, configuredDelay)) : 1500;
            let pacedCount = 0, lastPaced, maxPacedGap = 0;
            pacer = createMediaPacer({ delayMs, onError: fail,
              onRebuffer: () => log("media buffer depleted; rebuilding reserve"),
              write(data) {
                if (stopped) return;
                if (res.writableLength + data.length > 8 * 1024 * 1024) throw new Error("timed media consumer too slow");
                res.write(data);
                const now = performance.now();
                if (lastPaced !== undefined) maxPacedGap = Math.max(maxPacedGap, now - lastPaced);
                lastPaced = now;
                if (++pacedCount % 60 === 0) log(`paced output: fragments=${pacedCount}, maxGapMs=${Math.round(maxPacedGap)}, queuedBytes=${res.writableLength}`);
              },
            });
            log(`AV pacing buffer: ${delayMs} ms`);
            emitFragment = (fragment) => {
              if (!fragment || stopped) return;
              if (fragment.data.length) {
                const videoClock = fragmentClocks(fragment.data).find(([track]) => track === 1)?.[1];
                const data = fragment.init?.length ? Buffer.concat([fragment.init, fragment.data]) : fragment.data;
                pacer.push(data, videoClock / 90);
              } else if (fragment.init?.length) res.write(fragment.init);
              if (fragment.data.length) {
                const now = performance.now();
                if (lastOutput !== undefined) maxOutputGapMs = Math.max(maxOutputGapMs, now - lastOutput);
                lastOutput = now;
                for (const [track, ticks] of fragmentClocks(fragment.data)) {
                  if (ticks < (decodeHigh.get(track) ?? ticks)) backwards++;
                  decodeHigh.set(track, Math.max(ticks, decodeHigh.get(track) ?? ticks));
                }
                if (++fragments % 60 === 0) log(`output timing: fragments=${fragments}, maxGapMs=${Math.round(maxOutputGapMs)}, backwards=${backwards}, queuedBytes=${res.writableLength}, decodeTicks=${JSON.stringify([...decodeHigh])}`);
                fragmentBytes = 0;
                clearTimeout(outputTimer);
                outputTimer = setTimeout(() => fail(new Error("no timestamped media fragment for 10 seconds")), 10000);
              }
            };
            res.writeHead(200, { "content-type": "video/mp4", "cache-control": "no-store" });
            for (const frame of audioQueue) emitFragment(timedMux.pushAudio(frame, frame.timestampMs));
            audioQueue = [];
            selecting = false;
            log("source-timestamped video + AAC (fMP4, 250 ms fragments)");
            outputTimer = setTimeout(() => fail(new Error("no timestamped media fragment for 10 seconds")), 10000);
            feed.on("data", (frame) => {
              try {
                if (!Number.isSafeInteger(frame.timestampMs)) throw new Error("missing video source timestamp");
                fragmentBytes += frame.data.length;
                if (fragmentBytes > 8 * 1024 * 1024) throw new Error("timestamped fragment exceeds 8 MiB; missing keyframe");
                emitFragment(timedMux.push(frame, frame.timestampMs));
              } catch (error) { fail(error); }
            });
          } catch (error) { fail(error); }
          return;
        }
        selecting = false;
        // Preserve the existing G.711 / video-only fallback.
        feed = feed.map((frame) => Buffer.isBuffer(frame) ? frame : frame.data);
        feed.on("error", fail);
        const input = audioInput(firstAudio);
        if (!input) {
          log(
            firstAudio
              ? `video only; unsupported audio framing (${firstAudio.codec}, ${firstAudio.data.length} bytes)`
              : "video only; no audio received within 1200 ms",
          );
          audioQueue = [];
          res.writeHead(200, {
            "content-type": "application/octet-stream",
            "cache-control": "no-store",
          });
          feed.pipe(res);
          return;
        }
        log(`muxing video + ${firstAudio.codec} audio`);
        mux = spawn("ffmpeg", muxArgs(input), {
          stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
        });
        mux.on("error", fail);
        mux.on("exit", (code) => {
          if (!stopped) fail(new Error(`audio/video mux exited (${code})`));
        });
        // Bound diagnostics; never emit audio/video bytes or credentials.
        let diagnosticBytes = 0;
        mux.stderr.on("data", (data) => {
          if (diagnosticBytes < 2048) log(data.toString().slice(0, 512).trim());
          diagnosticBytes += data.length;
        });
        audioPipe = mux.stdio[4];
        audioPipe.on("error", fail);
        mux.stdio[3].on("error", fail);
        for (const frame of audioQueue) audioPipe.write(frame.data);
        audioQueue = [];
        feed.pipe(mux.stdio[3]);
        outputTimer = setTimeout(
          () =>
            fail(
              new Error("audio/video mux produced no output within 10 seconds"),
            ),
          10000,
        );
        mux.stdout.once("data", () => clearTimeout(outputTimer));
        res.writeHead(200, {
          "content-type": "video/mp2t",
          "cache-control": "no-store",
        });
        mux.stdout.pipe(res);
      }, 1200);
    } catch (error) {
      if (!stopped) fail(error);
    }
  };
}
