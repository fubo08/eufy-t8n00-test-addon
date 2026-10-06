import { spawn } from "node:child_process";

// Decode the existing RTSP publication, including its SDP codec configuration.
// go2rtc's isolated HEVC keyframe-to-JPEG path can fail on these NVR streams.
export function createSnapshotReader({ spawnProcess = spawn, timeoutMs = 18000 } = {}) {
  const pending = new Map();
  return function snapshot(id) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return Promise.reject(new Error("Invalid stream id"));
    if (pending.has(id)) return pending.get(id);
    const result = new Promise((resolve, reject) => {
      const child = spawnProcess("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp",
        // Codec parameters are supplied by RTSP SDP. Avoid the default multi-second
        // probe consuming Home Assistant's ten-second image request budget.
        "-analyzeduration", "500000", "-probesize", "262144",
        // Joining RTSP mid-GOP can decode concealed green frames successfully.
        // Wait for an independently decodable frame instead of accepting one.
        "-skip_frame", "nokey", "-err_detect", "explode",
        "-i", `rtsp://127.0.0.1:8554/${id}`, "-map", "0:v:0",
        "-frames:v", "1", "-an", "-c:v", "mjpeg", "-threads", "1",
        "-f", "image2pipe", "pipe:1",
      ], { stdio: ["ignore", "pipe", "ignore"] });
      const chunks = [];
      let bytes = 0, done = false;
      const finish = (error, data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        if (error) reject(error); else resolve(data);
      };
      const timer = setTimeout(() => finish(new Error("snapshot timed out")), timeoutMs);
      child.on("error", () => finish(new Error("snapshot decoder could not start")));
      child.stdout.on("data", (data) => {
        bytes += data.length;
        if (bytes > 8 * 1024 * 1024) finish(new Error("snapshot exceeds 8 MiB"));
        else if (!done) chunks.push(data);
      });
      child.on("close", (code) => {
        const data = Buffer.concat(chunks);
        if (code !== 0 || data.length < 4 || data.readUInt16BE(0) !== 0xffd8 || data.readUInt16BE(data.length - 2) !== 0xffd9)
          finish(new Error("snapshot decoder returned no complete JPEG"));
        else finish(null, data);
      });
    });
    pending.set(id, result);
    const clear = () => { if (pending.get(id) === result) pending.delete(id); };
    result.then(clear, clear);
    return result;
  };
}
