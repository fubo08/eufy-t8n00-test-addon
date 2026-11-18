# Optical audio / Full-HD qualification, 18 November 2026

Created with Codex.

I deployed test app **0.3.65**, artifact source **f5492a29c3a9a65bc0e25619bfe8636861978893**, built and tested for Linux amd64 and arm64 in [run 44288825619](https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/44288825619). Runtime profile selection copies the recorded bridge source and SDK package without editing their implementation. Hardware execution was on my HA amd64 host and T8N00 NVR; arm64 was build/unit qualification only.

| Profile | Exact bridge source | SDK | Selection |
| --- | --- | --- | --- |
| `audio` | #144 author head `22f18a74b1d6ddf64ab7ebbd258a0b79b06a3d08` | npm 0.5.0 | Default output, views 0/1 |
| `fullhd` | #187 head `451487d92dc50b815f4d3af6a7db3f92abc4dff4` | npm 0.6.0-beta.70 | Advertised `1080p` outputs, views 0/1 |

The beta override belongs only to the qualification artifact. PR #187 itself retains the central SDK **0.5.0** pin at the reviewer's request. On Linux its three real-SDK contract cases fail with 0.5.0; all 337 tests pass with the separately selected beta.70. The #144 author head passes all 304 tests with 0.5.0. This does not make the PR's pinned configuration green.

## Method

I used the same physical S4 and E40 cameras, selected by an existing private inventory rather than inventory order. Device inventories, serial numbers, hosts and credentials are excluded from this evidence. Source selection follows the bridge's advertised descriptors. FFmpeg pulls RTSP over TCP with `?video&audio=opus`, explicitly requires both video and audio, decodes to a null sink and records `showinfo`/`ashowinfo` statistics. No camera images or audio recordings are saved.

Each initial profile tests S4 view 0, S4 view 1 and E40 view 0 separately for 15 seconds of decoded output, with eight seconds between cases, then both S4 views concurrently for 20 seconds. After consumers close, I sample the bridge health `streaming` count at 10/20/30 seconds. Elapsed time includes startup and buffering; it is **not** a first-real-camera-frame latency measurement. Preliminary audio-only harness calls were stopped, corrected and excluded from the reported video cases.

## Observations

- **#144 / SDK 0.5.0:** all three individual cases decoded HEVC video and Opus audio. On the first concurrent attempt, view 0 failed to open with invalid input after about 20 seconds, while view 1 decoded both tracks. I repeated the concurrent attempt once: both views then decoded both tracks. The initial failure is retained in `audio.json`; the successful repeat is separate in `audio-retry.json`.
- **#187 / SDK beta.70:** all five individual/concurrent cases decoded both HEVC video and Opus audio at **1920x1080**. The concurrent samples decoded 405 and 404 video frames over about 20 seconds, and 1000 and 998 audio frames.
- HEVC reference warnings occur in both profiles. Some samples also contain one backwards decoded video PTS; no backwards decoded audio PTS was observed. These are successful short media-path probes, **not** a claim of warning-free playback or resolved smoothness.
- These two profiles differ in bridge source, SDK and requested output. The results do **not** isolate the cause of the initial concurrent failure or prove that beta.70 fixes it.

## Limits

This verifies decoder delivery and per-optic/output routes, not a listening test, acoustic distinction between optics, lip sync, browser WebRTC negotiation, Android/iOS playback, long-duration stability, PTZ physical response, or seven simultaneous views. I did not retest integration #176 through the HA options flow in this run; its earlier exact-head evidence remains separate. Default output geometry need not equal the sensor's maximum resolution; the raw reports retain all decoded geometries observed.

The bounded guard restores the original stable app and test-app options after both phases. Restoration is verified separately in the completion report; no dashboard or integration files are changed by this test.
