# Exact-head review qualification, 25 November 2026

I installed test app **0.3.71**, built from `206ba8866d762e100c422a1640a2bb53dbe81aa1`. Its isolated profiles retain their source/dependency pins in the Dockerfile. I did not validate the extracted PRs with my combined experimental branch.

- Bridge #187: `a3459db2d271736b63acb674c9fd3d51872c4379`, `fullhd78`, actual runtime SDK `0.6.0-beta.78`. The feature PR retains the central `0.5.0` pin; that older SDK cannot offer Full HD. Linux qualification separately runs the same suite with 0.5.0 (353 pass, three explicit capability skips) and beta.78 / beta.84 (356 pass, zero skips), on amd64 and arm64.
- Bridge #215: `f00bcf74c0f3736e38841a69796afbe06f99688e`, `registry05`, SDK `0.5.0`, 372 passing tests on both Linux architectures.
- Integration #203: `592851b32160fc50b18e165954b920af1718f2d6`, Python 3.14, 306 tests and 534 subtests on each architecture; Ruff checks pass. I did not install this integration candidate for a fresh UI test.
- [Successful Linux/container qualification](https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/45691998034).

## Bridge hardware observations

I used my T8N00 NVR with S4 and E40. I retained only sanitized decoder measurements, no encoded media, addresses, credentials or device serial numbers. Measurements identify source, deployed artifact, SDK, duration, model and requested optic/output.

For #187, both S4 views and E40 each completed 15-second decoded RTSP video + Opus audio runs at **1920 × 1080**. Both S4 views also completed simultaneous 20-second runs. All five FFmpeg processes exited zero. The first single S4 view had two backwards video PTS. Parallel views had six/four backwards video PTS, with maximum video PTS gaps 1.58/1.16 seconds; view 1 had one backwards audio PTS. Some runs emitted HEVC missing-reference warnings. I do **not** claim warning-free or continuous playback, an audio-stutter fix, physical lens identity verification or a browser hearing test.

For #215, all five single/parallel decoded video + Opus runs exited zero. Native geometry was principally S4 2688 × 1520 and E40 2560 × 1440; several starts also delivered initial 1920 × 1080 frames. Parallel runs had one backwards video PTS each; one had a backwards audio PTS. HEVC missing-reference warnings occurred.

I then held S4 view 0 for 55 seconds and deleted an **idle secondary-optic registration** via the documented go2rtc API. An immediate GET confirmed it was absent; one-second polling first observed its reappearance after **22,048 ms**. This is an observation bound, not exact internal reconciliation latency. No emergency restore was needed. The separate hold decoded 1,110 video frames and 2,732 audio frames and exited zero; it recorded four backwards video PTS and HEVC warnings, with forward audio PTS. This tests one missing idle registration, not all restart/removal/custom-source cases.

After each group, bridge health reported zero streaming sessions at 10, 20 and 30 seconds. The guarded test restores my original combined78 options, startup mode and watchdog; final restoration is recorded separately.

## Reproduction sources and limits

The first SDK comparison is retained as `*-initial-diagnostic.json` only. Both clients restored the cached session. The baseline advertised views and Full HD; #685 removed those methods as documented. Neither initial path delivered media. I identified a harness defect: the baseline's native dependency was installed with scripts disabled in a Debian build stage and copied into Alpine. That initial media failure is **not evidence of an SDK regression**. A corrected image rebuilds and verifies the native dependency in the target runtime and retains sanitized error messages before repeating the comparison.

The app artifact includes `native-rtc-probe.mjs` and the isolated runtime profiles. Bounded orchestration is in `scripts/review-071-guard.py`; the internal-API recovery check is in `scripts/review-071-registry.py`. The latter runs from my own HA terminal, without requiring Docker access or changing SSH protection mode. Its sanitized JSON was transcribed from that terminal into the recovery summary; other decoder reports were written directly by the measurement runner. `scripts/measure-review-071.mjs` retains that runner with only the private host and local FFmpeg path changed to mandatory `QUALIFICATION_HOST` / `FFMPEG_PATH` environment variables.

Created with Codex.
