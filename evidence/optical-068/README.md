# My optical Last screen and audio-timing qualification

I tested exact bridge source `012eacce0534570af25fcfa938ab482704fa4868` in test app 0.3.68, artifact `675154423dbdd89f9cd0217b132c9e55a484fc41`, isolated profile `optical78` and SDK beta.78. This is the extracted bridge implementation, not the combined media fork. Hardware records contain hashes, sizes and geometry, not camera identifiers or images.

I captured both optics of both S4 cameras through the production `screen.take` command and fetched their advertised Last screen paths. All four decoded, view 1 emitted its matching event, and its capture did not change view 0's retained bytes. I inspected the different optical scenes privately; the JPEGs are not included here.

My bridge [PR #220](https://github.com/mega-yfue/ha-eufy-sdk-bridge/pull/220) preserves the primary protocol. My integration [PR #203](https://github.com/mega-yfue/ha-eufy-sdk/pull/203), exact head `35fa42a96ba5a4329eb7c8b1d5dbc02e90076638`, consumes the additive descriptors and retains legacy primary entities. I did not install that integration candidate in HA or claim UI hardware validation for it.

## Automated checks

[Linux amd64/arm64 qualification](https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/44922176212): I asserted the bridge's two new regressions fail before the fix and the integration discovery regression fails before its fix, with no collection errors. Both architectures pass all 332 bridge tests on SDK 0.5.0 and beta.78, plus Prettier. The integration passes Ruff/format and 293 tests / 161 subtests excluding the separately run translation suite.

The full integration CI reports 298 passed / 506 subtests and one existing Polish-completeness failure. I verified that sole failure against the log; it is tracked in issue #200 and my separate PR #201. I did not duplicate that unrelated fix in the optical feature or call its whole CI green.

## Audio investigation is separate

The first arrival measurement used deployed combined78 artifact `e777f1aac7bb85b1a4687dba37667a1ec95b8e2a`. It saw 901 ADTS frames, 18 gaps over 250 ms, maximum 496 ms, while 50 seconds of RTSP Opus decoded without reported errors. Sample duration nearly matched elapsed time. These are timing/decoder observations, not a listening test.

I then used a separate `audio78` profile in artifact 0.3.68: combined source `a72e983ac429a7e1e8c4e22ed2a7648b0646d54e` plus a passive, qualification-only RTC audio-header observer. It leaves encoded bytes unchanged and records aggregate arrival/source-clock counters only. It does not validate the optical PR or constitute an audio fix.

In that repeat, I saw 934 raw RTC audio frames over 59.896 seconds: 927 source intervals of 64 ms, three of 128 ms, one each of 108/152 ms, and one repeated source timestamp. Arrival gaps reached 242 ms; the simultaneous HTTP observer reached 245 ms. There were no source-clock regressions. The earlier >250 ms stalls did not reproduce in this second interval. This establishes variable delivery before the browser/Opus path and occasional non-uniform source-clock steps, not the cause of every audible interruption or proof of lost encoded samples.

My historical app 0.3.3 (`94773f896e8999e160584331f67b5fc185e5337f`) preserved source timestamps using custom SDK `f644578aecfc3a996419ed8365a81d0490c9c08c` and a shared fMP4 path. Version 0.3.11 (`7e04bf36c5ef97f63ce1b859358df32b915116c3`) added a bounded 1500 ms common AV pacing reserve; `3c44898a6546702172710bbde79c00adf1acea96` removed `#async` from that already-timed source. Those mechanisms are absent from the current separate raw-video/AAC path. The old `media_buffer_ms` option remains in my test manifest but is not used by the current profile launcher.

Replaying arrival metadata through that historical pacer with a sample-count clock produces 64 ms output spacing with a 1500 ms reserve. This is offline simulation, not source-clock AV synchronization or a deployed/human-verified fix. A buffer cannot recreate missing samples. I have not proposed changing only audio latency, which would leave video unsynchronized.

I restored the original combined78 media profile afterward, with boot auto/watchdog enabled. The integration and dashboard files are unchanged by this qualification.

Created with Codex
