# 0.3.45

- Remove an unsupported RTSP input option from my decoder test; retain the bounded process deadline. The bridge and SDK candidates are unchanged.

# 0.3.44

- Retain bounded sanitized decoder and go2rtc diagnostics for my optical-view qualification; the bridge candidate and normal media source are unchanged.

# 0.3.43

I add an opt-in, bounded qualification for bridge optical-view candidate c5fed3bbafae782219f5f350ef2427bfcbffd848 with official SDK source 4f5d73f38e8bd62e74c1410ab510844a8b099307. Linux checks exercise the original pinned SDK and the current optical-view API. Hardware checks cover selected JPEGs and both generated go2rtc/RTSP sources; my normal media implementation and ports remain unchanged.

Created with Codex.

# 0.3.42

I refresh only the opt-in PR #450 qualification to SDK e34c7cfe3f379c9286cf7a297b5b2fc1f1323eda on beta-0.6.0 b7b111e. The Linux stage checks the before/after regressions and full verification; the bounded hardware test performs two E40 starts. My normal media SDK, ports and configuration defaults are unchanged.

Created with Codex.

# 0.3.41

I qualify the current-beta patch proposed for PR #450 at SDK `9260230de2367393ea880c87383ea5c978d55cdc` with full Linux verification and the existing opt-in portal-shard hardware test. My normal bridge media implementation is unchanged. Created with Codex.

# 0.3.40

I qualify the exact PR #479 review correction `dd35b27fc2eccbd318fcec671f8d806b6a8ed54f` through full Linux SDK verification and the existing opt-in optical-view hardware test. I keep the normal bridge media implementation unchanged. Created with Codex.

# 0.3.28

I explicitly requested a second observation trial: two left steps, five seconds apart, on the same selected S4 and unchanged PR #376 SDK revision. This trial has a separate once-only marker and remains opt-in. Created with Codex.

# 0.3.27

I require an explicitly selected S4 serial for the isolated PTZ test because my account has two S4 cameras. The first attempt stopped before any motion. The targeted qualification has its own once-only marker; the pinned SDK revision is unchanged. Created with Codex.

# 0.3.26

I added an isolated, opt-in once-only PTZ qualification of unmodified SDK PR #376 revision d8a4167bf1018fa8816f05127d6c38a031050420. It requires one attached T8E00 and the public PTZ capability, sends one right step then one left step, and records ACKs separately from physical observation. The normal experimental media SDK is unchanged. Created with Codex.

# 0.3.25

I added a separate once-only qualification using camera notification style 6020, keeping the currently reported Included Thumbnail value (2). This existing JSON command preserves the camera channel. It is enabled only by qualify_camera_notification_beta22; prior camera-test options are inactive. I also classify the SDK's explicit ambiguous-channel error without logging device identifiers. The two previous command attempts did not produce an ACK. Created with Codex.

# 0.3.24

I replaced the unsuccessful scalar LED qualification with a separate opt-in same-value night-vision command (1277, Infrared) using official SDK beta.22. The RTC router supports payload/JSON commands, not the LED's scalar command. The new option is qualify_camera_nightvision_beta22; the old option has no effect. The target must already report Infrared. This is a new explicit test with its own once-only marker, not an automatic retry. Created with Codex.

# 0.3.23

I added an isolated, opt-in test of the published official `@mega-yfue/eufy-sdk@0.5.0-beta.22` package. With `qualify_camera_beta22: true`, I send one LED-off command to a T8E00 (or T8P00) attached to the single T8N00, only when its status LED is already reported off. The test requires call authentication and command 1045 ACK evidence. It reuses a private cached session without a password, runs once with a 90-second deadline before the normal bridge, and never automatically retries. The result does not establish physical actuation of a same-state write. My normal experimental media SDK is unchanged. Leave the option false for ordinary use.

Created with Codex.

# 0.3.22

I added an opt-in, once-per-revision hardware qualification of PR #354 at `897201955d58e4ce1932e5d27575528f648d8e43`. The exact unmodified SDK is compiled separately. The normal bridge keeps my experimental camera/video SDK and configuration.

With `qualify_pr354: true`, the test runs before normal bridge startup, restores a private in-memory copy of the existing session without an account password, and requires exactly one T8N00 reporting Home. It sends one Home command through the public arming capability and requires both call authentication and a command 1224 ACK for success. It stops after 90 seconds; normal bridge startup follows even on failure. A persistent marker prevents automatic repeats after a restart or crash. Logs contain a compact result and the exact revision, without raw SDK logs or credentials.

Enable only after independently confirming Home in HA/the eufy app: cloud state can lag. This is an ACK qualification, not proof of an actual Away-to-Home transition or long-term reliability. Leave the option off for ordinary operation; after the attempt turn it off again. Failed attempts are not automatically retried.

Created with Codex.

# 0.3.21

Adds independently selectable RTC command signaling (`scall` or `call`) and ICE policy (`relay` or `all`). Defaults preserve the existing command transport. Video settings are unchanged. This permits a controlled hardware comparison for intermittent command-channel startup failures; it is not a claim that every timeout is fixed.

For the T8N00 comparison, select `rtc_command_signaling_mode: call` and `rtc_command_ice_policy: all`, then restart this bridge. Confirm the command ACK and resulting mode, repeat after more than one minute of inactivity, and test while video is active. Roll back by selecting `scall` / `relay` and restarting. Cloud login/signaling and DTLS certificate verification remain required; no commands are automatically replayed.
