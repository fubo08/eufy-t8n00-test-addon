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
