# Bounded NVR preview overview

The S4 lens snapshot routes and legacy E40 `/snapshot` route share one
demand-driven JPEG cache. A cached still is returned immediately while a stale
entry is refreshed in the background. The two S4 lenses have separate cache keys.
Only one preview decoder runs; after it exits the queue waits 15 seconds for the
native call to release. New still capture is deferred when two native live pulls
are registered. This is a conservative workaround for the observed four-call
limit, not a protocol fix or a guarantee for unlimited live consumers.

Uniform concealed decoder frames are rejected, including persisted gray frames.
This conservative quality check also retains the previous image for a genuinely
featureless/covered camera view; the old capture timestamp remains visible.

Images become eligible for refresh after two minutes; seven requested views can
take longer to complete a round. They are **previews, not synchronized video**.
HA requests drive the queue; abandoned requests expire after 45 seconds. With no
preview requests, no periodic capture continues. Last good images survive failed
refreshes and restarts under `/data/nvr-previews`. JPEGs are private camera data,
not diagnostics to publish. Maximum 32 entries, 8 MiB each. Cold requests wait at
most 7.5 seconds and may return unavailable until the initial image is captured.

`GET /nvr-preview-status` returns per-stream image timestamps, age, byte count,
pending/error state, and queue status without returning encoded image contents.
The endpoint has the same LAN access boundary as the existing bridge endpoints.
Do not publish its real device identifiers.

Use native `picture-glance` cards with `camera_view: auto` and `tap_action:
{action: more-info, entity: camera.<id>}`. The popup starts the selected live view;
the other cards continue requesting cached stills. Live codecs, resolution,
audio, ports, and entity IDs are unchanged. Avoid other dashboards with seven
permanent live cards during this test.

Created with Codex.
