# My audio-only reserve experiment

I am investigating steady-state audio stutter reported on my iPhone/iPad, separately from bridge audio-startup #211 and optical-image #220. This is supporting evidence for bridge #221, not an upstream fix PR or a listening-success claim.

## Exact candidate

- App 0.3.70, deployed qualification artifact `4122c6db32f99096a0fa84100ae3153520191273`, profile `realtime78`.
- Combined bridge source `2a4ad8057b09a69b6aec48638cc1dcb11745cc4d`; baseline `a72e983ac429a7e1e8c4e22ed2a7648b0646d54e`.
- SDK 0.6.0-beta.78, node-datachannel 0.33.6, go2rtc 1.9.9.
- Only the generated Opus-loopback audio filter changes. The build byte-compares the video feed, still feed, camera-view mapping, AAC opener, HTTP routing and streams module with the baseline.

My candidate prepends 384 ms of virtual silence, paces by the existing FFmpeg audio clock, trims that exact leading silence, and resets the output audio sample timestamps before Opus encoding. The virtual silence is not sent to the player. I do not use a Node timer for output pacing and do not modify the video path or NVR settings.

## Why I changed the experiment

My first Node ADTS pacer passed virtual-clock replay but added 167 ms of clock slip in a hardware run when its timers ran late. I stopped that experiment. Plain FFmpeg `arealtime` without a reserve also failed to absorb the recorded irregular S4 arrivals. I retained these negative results instead of submitting either implementation as a fix.

## Production-path regression

[Linux amd64 and arm64 run](https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/44929445932): 373 candidate tests passed on each architecture. The container also requires my recorded-arrival replay to fail against the immutable baseline caller and pass against the candidate caller. The probe uses the generated source and does not inject the fix.

The replay emits synthetic HEVC flash/AAC beep content using the first nine seconds of my sanitized measured S4 arrival trace, then decodes through the bridge HTTP handler, generated go2rtc sources and RTSP Opus output. Maximum observed decoded audio delivery gaps changed from 336 to 64 ms on amd64 and 338 to 64 ms on arm64. The relative beep-versus-flash offset changed by 0 ms on both. The absolute synthetic baseline offset was already about 370 ms; this does not establish physical NVR lip synchronization. A local Windows comparison showed an additional 75 ms, so I am not claiming zero added delay on every platform/start.

## NVR hardware observations

I tested the S4 secondary optic twice, with a bridge restart between runs. Each run observed raw AAC for 60 seconds and decoded Full-HD RTSP video/Opus audio for 40 seconds. Both candidate runs decoded successfully with 1920x1080 video and no backwards audio PTS.

| Observation | Baseline | Candidate first | Candidate after restart |
|---|---:|---:|---:|
| Raw AAC maximum arrival gap, ms | 256 | 334 | 305 |
| Decoded audio gaps over 100 ms | 64 | 1 | 1 |
| Maximum decoded audio delivery gap, ms | 254 | 284 | 109 |

These are different live intervals, not identical NVR packet replays. The first candidate still had one 284 ms output gap; I did not erase it. Decoded output arrival times are measured in the receiving process and can include receiver/network scheduling. Raw AAC remains bursty by design because I changed only the Opus loopback.

The JSON files contain model, timing and decoder counters, not encoded media, camera images, serial numbers, addresses or credentials. Existing video DTS warnings from the null-muxer diagnostic are retained. I have not demonstrated physical AV synchronization, long-duration stability, concurrent-camera behavior, or an independently extracted upstream implementation. My first iPhone/iPad listening feedback, while realtime78 was confirmed active at 18:35 Europe/Berlin, is: stuttering is reduced, but remains audible. This is a partial improvement, not a resolved issue. No physical synchronization conclusion was reported.

Created with Codex
