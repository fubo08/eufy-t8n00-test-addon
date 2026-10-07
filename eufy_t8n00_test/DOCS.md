
## Experimental start comparison (0.3.20)

`rtc_video_start_mode` defaults to `prelude`: send 1103, then 1003 after 150 ms.
`direct` sends only 1003. This is an opt-in hardware experiment inspired by upstream SDK PR #345; T9000 evidence does not establish T8N00 compatibility.
Restart the bridge after changing this option. Keep ICE, signaling, buffering and resolution fixed during comparisons. Test one E40 first, then both S4 lenses with audio. Revert to `prelude` if a start fails.
This release also rejects correlated negative start acknowledgements immediately and releases error listeners when the media session closes.
