# Hardware qualification, 21 November 2026

I deployed test app **0.3.66**, artifact **e777f1aac7bb85b1a4687dba37667a1ec95b8e2a**. Both Linux architectures passed: https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/44911760123

| Profile | Exact bridge source | SDK | Scope |
| --- | --- | --- | --- |
| primer05 | 89d371442fa82c2d5736792e97dc53e7a76c14ea | 0.5.0 | Exact #211 |
| registry05 | 4105a0f40888aed79c1001a5bf61264035f45600 | 0.5.0 | Exact #215 |
| combined70 | a72e983ac429a7e1e8c4e22ed2a7648b0646d54e | 0.6.0-beta.70 | #187 + #211 + #215 + alternate-source removal compatibility fix |
| combined78 | a72e983ac429a7e1e8c4e22ed2a7648b0646d54e | 0.6.0-beta.78 | Same combined source and dependency tree as combined70 |

The two combined profiles use node-datachannel 0.33.6. They do not validate an unmodified extracted feature PR or its central SDK 0.5.0 pin.

I used the same physical S4 and E40 on my T8N00 NVR. The `single` cases request 15 seconds of decoded RTSP video plus Opus audio. The `parallel` cases request 20 seconds per S4 optic simultaneously. Primer05's parallel case requests 15 seconds. Private device identifiers, network addresses, URLs and inventory files are excluded.

## Observations and limits

- #211: three first AAC requests and two repeats returned complete mono ADTS frames. Only the cached primary repeat returned its first byte in approximately 14 ms; the secondary repeat still took about 2.63 s. First byte can be silence from the primer, not real microphone onset. Both optics decoded video and Opus audio in parallel. SDK 0.5.0 rejected the microphone-off command; readback stayed true. That requested branch was not exercised. The probe's failure status retains this failure rather than treating it as a pass. Later health check reported zero streaming sessions.
- #215: all five single/parallel decoder cases completed. An idle E40 registration returned after deliberate DELETE. In the first deletion a separate S4 client was active; the next GET already showed the registration restored. A second deletion after that client ended was observed absent (6 total), then present again (7 total) at a check 41.5 seconds later. That is an observation bound, not recovery latency. The 55-second S4 hold completed, with one backwards video PTS and decoder warnings. No backwards audio PTS was measured.
- Combined SDK comparison: all three Full-HD single cases decoded 1920x1080 video and Opus audio on both betas. In the initial simultaneous start, one optic failed on **each** beta (view 0 on beta.70, view 1 on beta.78). A beta.78 repeat then decoded both optics. I retain all results: a successful repeat does not erase the initial failure or establish a reliable startup fix. Video/audio clients were released, and the health endpoint reported zero streaming sessions at 10/20/30 seconds.
- `status: complete` means the measurement script completed; it does not mean every case passed. Evaluate each case's exit, frames and errors.
- HEVC missing-reference warnings remain in several samples. These are bounded decoder checks, not listening, lip-sync, all-browser or sustained smoothness qualification. I do not attribute the intermittent failures to either SDK, #211 or #215 from this comparison alone.

The guard restored the normal bridge after these four phases. Any later chosen HA deployment is a separate action and is not part of this hardware comparison.

Created with Codex.
