# Eufy T8N00 RTC test bridge

Experimental Home Assistant add-on for testing T8N00 commands through the existing T9000 WebRTC implementation. Not yet verified on a real T8N00. No video transport change is included.

Pinned sources:
- SDK: fubo08/eufy-sdk `9f366ba15529611267ef5af95322a025205669c1` (complete T9000 RTC implementation plus exact-model T8N00 routing).
- Bridge: mega-yfue/ha-eufy-sdk-bridge `ac95e6d186135d20c956e0f2e16add34ca257cbb`.
- Add-on launcher adapted from mega-yfue/ha-eufy-sdk-addon `3129d2a0b08f8b3c5e6f528de984687d6b7ea459`.
- Native WebRTC runtime: node-datachannel 0.33.4; go2rtc 1.9.9.

## Installation and rollback

Add this repository URL to the add-on store repositories, then install **eufy T8N00 RTC Test Bridge**. Supervisor builds the image locally; the initial build can take several minutes. Supported architectures: amd64 and aarch64. GitHub Actions separately checks both container architectures and runs bridge regression tests without account credentials.

Stop the existing bridge before starting this one: simultaneous sessions on the same eufy account can displace each other. Keep the previous add-on installed. Configure email, password and account country through Home Assistant only; never commit credentials or session files. This add-on has its own persistent data directory. Defaults use host ports 3000 (bridge) and 8554 (RTSP); discovery reads the actual mappings.

Test login and device discovery first, then incoming notifications. Only then manually test an arming mode change while present, verify the result in the official app, and restore the original mode. Do not use this experimental bridge as your only alarm control. To roll back, stop this add-on, restart the previous bridge and restore the integration endpoint if changed.

## What WebRTC means here

The inherited RTC implementation forces TURN relay candidates. Command data therefore travels via an internet relay, with DTLS encryption, rather than directly across the LAN. Cloud signaling is also required. Direct LAN mode is not implemented or validated here. Video continues to use the bridge's existing media paths; successful commands do not establish T8N00 video support.

The Python/aiortc certificate parsing fix discussed in HallyAus/Eufy-Home-Assistant issue 20 is not copied: this SDK uses native libdatachannel. Whether this stack encounters a corresponding T8N00 certificate problem requires an actual device test. Certificate verification has not been disabled.

For an existing 0.1.0 installation, set the host ports in the add-on Network settings to 3000 and 8554, save and restart. Home Assistant may retain previously saved port mappings after an update. Keep the previous bridge stopped. No integration or device recreation is needed.
