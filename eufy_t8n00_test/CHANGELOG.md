# 0.3.21

Adds independently selectable RTC command signaling (`scall` or `call`) and ICE policy (`relay` or `all`). Defaults preserve the existing command transport. Video settings are unchanged. This permits a controlled hardware comparison for intermittent command-channel startup failures; it is not a claim that every timeout is fixed.

For the T8N00 comparison, select `rtc_command_signaling_mode: call` and `rtc_command_ice_policy: all`, then restart this bridge. Confirm the command ACK and resulting mode, repeat after more than one minute of inactivity, and test while video is active. Roll back by selecting `scall` / `relay` and restarting. Cloud login/signaling and DTLS certificate verification remain required; no commands are automatically replayed.
