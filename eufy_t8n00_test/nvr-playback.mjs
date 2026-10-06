// One original producer per lens; every compatible consumer shares its encoder.
export function playbackTemplates() {
  return [
    "ffmpeg:",
    '  nvr_input: "-timeout 20000000 -rtsp_transport tcp -err_detect explode -i {input}"',
    '  nvr_h264: "-c:v libx264 -preset superfast -tune zerolatency -crf 20 -pix_fmt yuv420p -threads 2 -bf 0 -g 20 -keyint_min 20 -sc_threshold 0 -r 20 -fps_mode cfr"',
  ];
}

export function playbackStreams(cfg, device, env = process.env) {
  const compatible = env.EUFY_PLAYBACK_PROFILE === "h264";
  const width = ["1920", "2560", "native"].includes(env.EUFY_PLAYBACK_WIDTH)
    ? env.EUFY_PLAYBACK_WIDTH : "1920";
  return device.streams.flatMap(stream => {
    const source = `ffmpeg:http://${cfg.selfHost}:${cfg.port}/nvr-stream/${device.sn}/${stream.sensor}#video=copy#audio=aac`;
    if (!compatible) return [`  ${stream.id}: ${source}`];
    // Keep the unscaled source accessible for archival/original-quality clients.
    const original = `${stream.id}_original`;
    const scale = width === "native" ? "" : `#raw=-vf scale='min(${width},iw)':-2`;
    return [
      `  ${original}: ${source}`,
      `  ${stream.id}: ffmpeg:${original}#input=nvr_input#video=nvr_h264#audio=copy${scale}`,
    ];
  });
}
