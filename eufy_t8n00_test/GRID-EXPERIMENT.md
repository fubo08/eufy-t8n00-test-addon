# Isolated NVR grid experiment

I traced the public vendor portal on 2026-10-20. Its live page submits a list of camera/channel/sensor positions through one 1003 command. Layout 3 is a 3x3 grid; the portal explicitly offers stitched 1920x1080 and 3840x2160 output. This suggests a composite stream, not seven independent full-resolution feeds.

The diagnostic process uses official SDK beta.74 with a runtime override of only that outgoing start command. It preserves the account, envelope and play slot, requests all seven verified local optical views, counts media-channel geometry, and decodes grayscale grid samples. It tries 4K first, then Full HD if necessary. It does not change production media handling, camera settings or the persisted login. A global two-minute deadline restores normal startup even if the test fails. The flag defaults off and a revision-specific marker prevents accidental repeated testing.

This is an experiment, not upstream validation of unmodified SDK behavior or a ready PR. Per-tile variation does not establish physical lens identity or audible sound. No encoded frames, account IDs or serials appear in reports.

Sources inspected:
- https://security.eufy.com/js/player-tools-WmjL7uOP.js — SHA256 3a40893ddc55f8a2635a1cd31db8af0b312d50f01e3c730c1cc882b36a2deff0
- https://security.eufy.com/js/index-DCT6KpNm.js — SHA256 b334dcb500196854034161b25c3ea36f944751741087602b822bb81220043418

Created with Codex.
