# Eufy T8N00 RTC test bridge

Experimental Home Assistant add-on for testing T8N00 commands through the existing T9000 WebRTC implementation. RTC arming control has been confirmed on a real T8N00. Version 0.2.0 adds experimental video-only RTC pulls; live video still needs hardware verification.

Pinned sources:
- SDK: fubo08/eufy-sdk `5af282fd7cabdc0601354706812e2e9269ede409` (complete T9000 RTC implementation plus exact-model T8N00 routing and experimental video pulls).
- Bridge: mega-yfue/ha-eufy-sdk-bridge `ac95e6d186135d20c956e0f2e16add34ca257cbb`.
- Add-on launcher adapted from mega-yfue/ha-eufy-sdk-addon `3129d2a0b08f8b3c5e6f528de984687d6b7ea459`.
- Native WebRTC runtime: node-datachannel 0.33.4; go2rtc 1.9.9.

## Installation and rollback

Add this repository URL to the add-on store repositories, then install **eufy T8N00 RTC Test Bridge**. Supervisor builds the image locally; the initial build can take several minutes. Supported architectures: amd64 and aarch64. GitHub Actions separately checks both container architectures and runs bridge regression tests without account credentials.

Stop the existing bridge before starting this one: simultaneous sessions on the same eufy account can displace each other. Keep the previous add-on installed. Configure email, password and account country through Home Assistant only; never commit credentials or session files. This add-on has its own persistent data directory. Defaults use host ports 3000 (bridge) and 8554 (RTSP); discovery reads the actual mappings.

Test login and device discovery first, then incoming notifications. Only then manually test an arming mode change while present, verify the result in the official app, and restore the original mode. Do not use this experimental bridge as your only alarm control. To roll back, stop this add-on, restart the previous bridge and restore the integration endpoint if changed.

## What WebRTC means here

The inherited RTC implementation forces TURN relay candidates. Command and experimental video data therefore travel via an internet relay, with DTLS encryption, rather than directly across the LAN. Cloud signaling is also required. Direct LAN mode is not implemented or validated here. NVR-attached cameras now use dedicated RTC video sessions through openReadable; other SDK media APIs retain their existing paths. Video is forwarded as Annex-B through ffmpeg/go2rtc. Audio is not yet included. H.265 playback depends on the viewing client; transcoding is not enabled in this version.

The Python/aiortc certificate parsing fix discussed in HallyAus/Eufy-Home-Assistant issue 20 is not copied: this SDK uses native libdatachannel. Whether this stack encounters a corresponding T8N00 certificate problem requires an actual device test. Certificate verification has not been disabled.

For an existing 0.1.0 installation, set the host ports in the add-on Network settings to 3000 and 8554, save and restart. Home Assistant may retain previously saved port mappings after an update. Keep the previous bridge stopped. No integration or device recreation is needed.

## Version 0.2.0 video test

Update and restart the add-on, keeping ports 3000 and 8554. Keep debug_p2p enabled during the first test to expose RTC diagnostics. Open ONE camera first for about 30 seconds. Look for [rtc:video] connected and [rtc:video] first frame. Close it and verify arming mode still works. Then try a second camera. A command channel opening alone is not proof of video. First-frame and stalled-video timeouts close the pull; output buffering is bounded. The existing PTCS reassembler is retained; firmware-specific video fragmentation/FEC differences may require further work based on the test logs. Do not upload unredacted logs to public issues.
