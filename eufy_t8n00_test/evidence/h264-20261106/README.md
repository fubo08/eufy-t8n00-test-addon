# H.264 compatibility evidence

I tested bridge source `afc03ba699dae95b27e03502d2324296710ce760` in test-app artifact `602ca92286e903f6e8fa2c86979fe97765899d49` (0.3.60), using the official 0.7.2 runtime base and SDK 0.5.0. Both architecture checks passed: https://github.com/fubo08/eufy-t8n00-test-addon/actions/runs/42291283313

All seven optical RTSP source IDs decoded as H.264, sequentially, for four seconds per case, with ten-second pauses. These are three T8P00 E40 cameras and two T8E00 S4 cameras with both advertised views. H.264 conversion was configured through the actual environment/configuration/generator path after restarting the app, not patched into the generated YAML during this qualification. The SDK and camera recording settings were unchanged.

The browser diagnosis was separate: my Brave WebRTC receive capabilities included H.264, VP8, VP9 and AV1, but no H.265/HEVC. My Carport source previously delivered decodable HEVC. On an earlier diagnostic app 0.3.59 I changed only that runtime source to H.264, verified decoded 1920x1086 output, and confirmed the picture then played in Brave. This browser feedback supports the codec diagnosis; it is not an exact-source browser test of 0.3.60.

Limits: no seven-way concurrent-live qualification, no long-duration or Android validation, no audible audio test, no A/V sync measurement, and no frame-freshness guarantee from a JPEG response. An initial kept frame may precede the live feed. Heights follow the source aspect ratio rather than being forced to 1080 pixels. The normal official bridge is restored after qualification.

Created with Codex.
