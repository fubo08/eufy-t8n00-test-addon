# Audio PR #144: NVR hardware evidence

I tested Bielecki-UK's audio implementation in a rebase assistance candidate, not the unchanged PR head. Exact bridge source: `9520ee71ade9ed11a4e2c5d7757e6292815662a6`; exact deployed test-app source: `99d9aaaf0d90fcd8ae283ca2fd548d2d35dd8f14` (0.3.61). The runtime base is official bridge 0.7.2 with SDK 0.5.0. T8N00 firmware 4.4.0.3 is user-reported. No Full-HD, H.264 conversion or secondary-primer experiment was included.

The candidate adapts PR head `bc1f7582683ac6b807a9940f2eb2c1e12af11a89` onto dev `a59616902f6694feca69ead8bc6d9dd6962ffb90`. Its `src/live-audio.mjs` is unchanged from that PR head. The HTTP merge preserves current video primer/retry/cleanup behavior, forwards the selected optical view to audio, and excludes audio from the still-picture tap. The generator retains each advertised view ID, stream query and existing indoor video template. These changes require review; I do not claim the original conflicting PR head was directly hardware-tested.

Linux lint, full tests and both architecture builds passed in https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/42295249900 . The new production HTTP secondary-audio regression fails on unchanged dev and passes on the candidate. Existing optical generator assertions were updated for audio's source-list shape while retaining routing checks. Local Windows full-suite testing hit the pre-existing platform-path assertion; Linux is the full-suite qualification environment.

On 2026-11-06 I decoded HTTP AAC-LC at 16 kHz for S4 (T8E00) primary and secondary optics and an E40 (T8P00): each produced 95 decoded frames / 6.08 seconds of samples. Audio joining existing S4 video also decoded 6.08 seconds; the concurrent video consumer decoded 234 frames before I deliberately terminated the probe. A separate listener check in Brave confirmed audible outdoor sound from the direct AAC endpoint.

RTSP Opus with the PR's existing `asetpts=N/SR/TB` path decoded 401 frames / 8.02 seconds of samples for the S4 secondary optic and E40. See hardware.json for sample rates and PTS measurements.

**Native RTSP AAC is not a realtime pass:** in the S4 case a six-second timestamp-limited pull decoded only 20 AAC frames / 1.28 seconds of samples, while PTS advanced from 0 to 6.211625 seconds. The direct AAC endpoint did not show this sample-duration mismatch. This supports retaining the existing sample-count Opus restamping and records an unresolved native-AAC timing limitation; it does not establish which upstream component causes it.

With all machine probe consumers closed, health streamingCount was zero at 10, 20 and 30 seconds. The official bridge was restored with its prior auto-start/watchdog settings; the test bridge and temporary SSH were stopped.

Limits: short sequential tests of one S4 and one E40, not all cameras or seven concurrent sources; cold media start rather than NVR power cycle; no exact-source WebRTC audible playback, A/V sync, Android, long-duration or microphone-off hardware qualification. No raw logs, audio, images, serial numbers, addresses or credentials are included.

Created with Codex.
