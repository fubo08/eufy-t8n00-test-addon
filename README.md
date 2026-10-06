# Eufy T8N00 RTC test bridge — 0.3.5

Version 0.3.5 adds targeted timing diagnostics for backwards jumps during otherwise continuous playback. Per-sensor RTC summaries report source timestamp regressions, repeated timestamps, arrival gaps and relative lag growth for audio/video. Bridge output summaries inspect fMP4 track decode clocks, emission gaps and queued bytes. Encoded media is neither logged nor reordered. This is a diagnostic release, not a confirmed fix for the remaining jumps. Keep debug_p2p enabled and capture 60–90 seconds with the same two views. Integration remains 0.3.1b1.

Version 0.3.4 emits continuous fMP4 fragments at approximately 250 ms source-time intervals without waiting for another keyframe. This reduces bridge-induced burst delivery of audio and video. An established media peer may also survive a lost signaling socket; peer/channel failure or the existing 15-second media stall deadline still terminates it. Ordinary command sessions keep their existing lifecycle. Linux tests use a ten-second HEVC GOP and decode the resulting short fragments. Hardware validation remains necessary. Integration stays 0.3.1b1, ports 3000/8554.

Version 0.3.3 preserves RTC source timestamps for S4 AAC-LC streams and uses the SDK's existing fMP4 muxer instead of passing untimed video/audio through separate FFmpeg pipes. Raw video-only and G.711 fallbacks remain available. The RTSP publisher retains AAC encoding. Source timestamps and keyframe-based fragments require hardware validation; this does not claim to fix every signaling or HA startup error. Integration 0.3.1b1 and ports 3000/8554 stay unchanged.

Version 0.3.2 isolates snapshot failures from live-stream retry pauses and coalesces concurrent SDK client hydration for the two lenses. Actual stream failures retain their bounded retry pause. Both S4 views, received audio and PTZ were confirmed in Home Assistant with 0.3.1, but startup delays and intermittent session failures remain under investigation. These changes do not guarantee elimination of the NVR first-frame timeout.

Update only the bridge to 0.3.2; keep integration 0.3.1b1 and ports 3000/8554.

Version 0.3.1 fixes the RTSP handoff of AAC sound. The 0.3.0 hardware log confirmed video from both S4 sensors and incoming AAC-LC, but go2rtc's FFmpeg publisher rejected copied AAC with `AAC with no global headers is currently not supported`. The final RTSP publisher now encodes AAC to supply the required configuration; video remains copied. Busy/open failures also impose a per-camera retry pause shared across its lenses and snapshots (30 seconds for RTC 486, 10 seconds for other failures). A Linux test now exercises MPEG-TS through the actual bundled go2rtc into an RTSP client, in addition to the existing mux tests.

Update only the bridge to 0.3.1; the companion HA integration remains 0.3.1b1. Close existing live viewers before restarting the bridge, then test one view first.

Experimental Home Assistant add-on. Arming-mode changes and one T8E00 PoE S4 live view have been confirmed on the owner's T8N00. This update adds selection of the two optical sensors, PTZ detection and received audio support. Both views, received audio and PTZ have since been confirmed on the owner's hardware.

## Update and view both cameras

Update this add-on and restart it. Keep the original bridge stopped and keep ports **3000** (bridge) and **8554** (RTSP). The repository is `https://github.com/fubo08/eufy-t8n00-test-addon`; Supervisor builds the image locally on amd64 or aarch64. Existing saved port mappings are retained by HA.

For separate **Fixed / Movable** camera entities under the same S4 device, install the [test integration 0.3.1b1](https://github.com/fubo08/ha-eufy-sdk/blob/dev/T8N00-TEST.md). The original camera unique ID remains the movable view; no device or integration-entry deletion is needed. The four direction buttons control the movable camera. Presets are not exposed for this model because their wire format has not been verified.

Open each view separately before trying both together. Enable sound manually in the player. Keep `debug_p2p` enabled for the first test: `[rtc:video]` names the sensor, `[rtc:audio]` reports the first received audio codec and `[nvr:media]` reports whether audio is included. Logs contain account/device information; do not post unredacted logs publicly.

## Audio and limits

Audio is requested with the camera channel in `audio_chn`, then separated from video command 1300 into audio command 1301. Supported bridge inputs are AAC-LC in ADTS and G.711 A-law at 16 kHz mono. FFmpeg copies video and encodes sound to AAC in MPEG-TS for go2rtc/HA. With no supported audio in the first 1200 ms after video arrives, the route continues video-only and explains why in the log. Raw AAC/AAC-ELD is not decoded in this version; it requires further framing/decoder work if the device emits it. This is listening, not two-way talk.

The inherited RTC implementation still forces TURN relays for commands and video, encrypted with DTLS. Cloud signaling and internet access are required; direct LAN mode has not been implemented. H.265 playback depends on the viewer. Video transcoding is not enabled.

Both optical views currently use separate RTC pulls; the NVR's simultaneous-session limits need hardware confirmation. Lens-specific snapshots use the same go2rtc source as that lens's live view. Other models retain the original bridge path.

## Pinned sources and protocol evidence

- SDK: fubo08/eufy-sdk `46a7ae12243ad2991e53e08664afaaa89bbc54fb` — complete upstream T9000 RTC implementation plus T8N00 routing/video and S4 sensor/audio support.
- Bridge: mega-yfue/ha-eufy-sdk-bridge `ac95e6d186135d20c956e0f2e16add34ca257cbb`, with the patches in this repository.
- Launcher: adapted from mega-yfue/ha-eufy-sdk-addon `3129d2a0b08f8b3c5e6f528de984687d6b7ea459`.
- Runtime: node-datachannel 0.33.4, go2rtc 1.9.9.
- Eufy's public web player (security.eufy.com, inspected 2026-10-04) selects sensor 0 for the fixed and sensor 1 for the movable S4 view, and uses command 6030 for direction steps. Its media worker distinguishes video 1300 and audio 1301. The audio header parser also follows the existing SDK audio contract. No vendor WASM is shipped.

GitHub Actions builds amd64 and arm64, runs the focused SDK tests, the bridge regression suite and a synthetic FFmpeg audio/video mux test. These do not replace a real NVR test.

## Rollback

Keep the previous add-on/integration backup. Stop this bridge before switching to another one; simultaneous account sessions can displace each other. Restore the previous integration folder and restart HA, or select the previous bridge revision. Credentials and session files belong only in Home Assistant's add-on configuration/data directory.

## 0.3.6: optional direct-video experiment

The add-on option `rtc_video_ice_policy` defaults to `relay` (existing behavior). Set it to `all` to allow direct ICE candidates alongside the existing TURN servers for video only. Restart the add-on after changing the option. Control/PTZ sessions remain relay-only.

Look for `[rtc:path]`: `route=relay` means at least one selected endpoint uses TURN, `route=direct` means neither does. Direct is not proof of a LAN-only route. Addresses and credentials are omitted from this diagnostic. Cloud authentication/signaling remain required. Docker networking and NVR firmware may prevent direct connectivity.

This is ICE selection, not an automatic retry after a failed DTLS handshake. If video no longer starts, return the option to `relay` and restart. Close camera views before restarting; test the same two views, then each view separately with sound. Ports and integration configuration are unchanged.

## 0.3.7: diagnose direct handshake failures

Adds `[rtc:ice]` state changes and `[rtc:path]` selection reports before DTLS completes and before closing a timed-out peer. A process-local peer number correlates simultaneous connections without device identifiers. `route=unselected` means no candidate pair is selected yet. ICE completed with a selected direct pair but no connected peer points beyond ICE; it does not by itself identify the DTLS cause. Media processing is unchanged.

## 0.3.8: native handshake trace for all mode

When rtc_video_ice_policy is all, enable a filtered native DTLS/SCTP trace. It records fixed handshake events, recognized error categories and message sizes only, with a 200-line limit. Raw native log text, SDP, addresses and credentials are not forwarded. Native logging is process-wide, so test one camera at a time. Relay mode does not enable verbose native tracing. This is a diagnostic release, not a confirmed connectivity or stutter fix; certificate verification remains enabled.

## 0.3.9: native call signaling experiment

Set `rtc_video_signaling_mode` to `call` to send the complete native SDP answer, including SCTP, media and ICE attributes. The default `scall` keeps the previous compact exchange and is available for comparison. This follows the protocol change documented in [HallyAus native T8N00 calls](https://github.com/HallyAus/Eufy-Home-Assistant/commit/3d0c3c89b0449e1d020642dbe51e9740e045e0ee).

Restart the bridge after changing this option. Keep the existing ICE policy for a controlled comparison; `call` does not itself force a local path. Video only: control/PTZ signaling, ports, credentials and integration configuration are unchanged. This is an experiment, not a confirmed local-connectivity fix. Certificate verification remains enabled.

## 0.3.10: coordinate native video starts

In `call` mode the bridge queues new video negotiations. The next start waits until the previous pull has produced its first video frame (or failed), with at least eight seconds between start attempts. Running streams continue concurrently. Abandoned queued HTTP requests are cancelled before they open a session. `scall` is unchanged. This targets the observed simultaneous-start timeout; it does not claim to fix remaining audio timing irregularities.

## 0.3.11: optional shared AV pacing buffer

`media_buffer_ms` defaults to 1500 (range 0–3000). Complete video/AAC fragments are paced together on their source video clock; encoded contents and media timestamps are unchanged. This trades additional latency for a reserve against uneven arrival. Set 0 to disable the reserve for comparison. A gap exceeding the reserve triggers rebuffering, logged explicitly; missing media cannot be restored. Pending output is cancelled on disconnect and the pacing queue is capped at 8 MiB. Video-only/G.711 fallback is unchanged.
