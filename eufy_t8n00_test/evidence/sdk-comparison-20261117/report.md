# SDK comparison, 17 November 2026

I compared the installed stable app reference with a fixed Full-HD bridge source using published SDK beta.35 and beta.63. I selected the same E40 and S4 by private device IDs, rather than inventory order. No private IDs or media are included in this report.

Test app **0.3.64**, artifact `b3819194e9d64f77470bc09ae143e9468d53152c`, bridge `8b6d485b926b0207eb6e209cfa1a477f697eb6d4`. [Two-architecture Linux gate](https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/44144395442) passed 295 bridge tests with each SDK, formatting, syntax and runtime/container checks. The SDK packages retain the same dependency requirements.

| Reference | Completed decoder cases | Decoded frames | Backwards decoded PTS | Decoder-warning matches |
|---|---:|---:|---:|---:|
| stable | 3 | 1213 | 0 | 1 |
| beta35 | 8 | 2734 | 0 | 5 |
| beta63 | 8 | 2714 | 0 | 1 |

The stable reference ran three 20-second default-output cases. Each beta ran those three cases, three 10-second Full-HD cases, and two concurrent 30-second S4 views. The beta frame totals therefore cover more measurements than the stable total.

| SDK | Concurrent S4 view | Frames / requested 30 s | Largest decoded PTS gap |
|---|---:|---:|---:|
| beta35 | 0 | 267 | 0.594 s |
| beta35 | 1 | 600 | 0.226 s |
| beta63 | 0 | 246 | 0.592 s |
| beta63 | 1 | 609 | 0.275 s |

Both beta runs refreshed the S4 last-screen JPEG successfully through `screen.take` and observed a newer saved timestamp. The current beta inventory retains all seven optics and their Full-HD alternatives, and adds `link` to the existing capability lists on my five PoE cameras. This checks read-only inventory, not successful physical setting writes.

## Boundaries

- Short decoder measurements, not browser smoothness or audible audio
- First decoded output may be a bridge primer, not the first actual camera frame
- One sequential A/B run with the same fixed physical devices, not repeated randomized latency samples
- No physical setting writes, seven-call capacity test or all-platform qualification
- SDK packages share the unchanged dependency requirements and the fixed bridge lockfile dependency tree

The aborted first beta.35 attempt used inventory-order selection. I discarded it and repeated beta.35 with fixed device selection; its separate discarded-order report is not part of these totals.

The shared Full-HD bridge includes neither the independent audio PR #144 nor H.264 conversion PR #151. A passing SDK comparison does not qualify those combined features. The ordinary integration and dashboards were not modified. After completion I verified the stable app 0.8.2 running with watchdog enabled and boot auto, test app 0.3.64 stopped with watchdog disabled and boot manual, original app options restored, and health/auth OK with zero streams. The existing SSH app was already running and was left running.

Created with Codex.
