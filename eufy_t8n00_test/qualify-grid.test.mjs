import { test } from "node:test";
import assert from "node:assert/strict";
import { gridStart, qualifyGrid } from "./qualify-grid.mjs";
function packet(cmd = 1003) {
  const data = Buffer.from(JSON.stringify({ account_id: "synthetic-account", cmd, payload: {
    ClientOS: "WEB", entrytype: 0, camera_type: 0, key: "", msg_id: 116, audio_chn: 1,
    streamtype: 2, stitch_mode: 1, chn_list: [{ index: 0, chn: 1, sensor: 0, isUps: 0, isClicked: true }],
    pip_cord: { x1: 0, y1: 0, x2: 0, y2: 0 }, station_video_type: 6, play_id: 1,
  } }));
  const header = Buffer.alloc(16); header.write("XZYH"); header.writeUInt16LE(1350, 4);
  header.writeUInt32LE(data.length, 6); header[11] = 29; header[12] = 255; header[14] = 1; header[15] = 2;
  return Buffer.concat([header, data]);
}
const views = [{ channel: 1, view: 0 }, { channel: 1, view: 1 }, { channel: 2, view: 0 },
  { channel: 2, view: 1 }, { channel: 3, view: 0 }, { channel: 4, view: 0 }, { channel: 5, view: 0 }];
test("vendor grid overrides only layout fields of the exact SDK start envelope", () => {
  const input = packet(), saved = Buffer.from(input);
  const output = gridStart(input, views, { width: 3840, height: 2160 });
  assert.deepEqual(input, saved); assert.equal(output.readUInt32LE(6), output.length - 16);
  for (const byte of [11, 12, 14, 15]) assert.equal(output[byte], input[byte]);
  const command = JSON.parse(output.subarray(16));
  assert.equal(command.account_id, "synthetic-account"); assert.equal(command.payload.play_id, 1);
  assert.equal(command.payload.station_video_type, 6); assert.equal(command.payload.msg_id, 116);
  assert.equal(command.payload.stitch_mode, 3); assert.equal(command.payload.chn_list.length, 7);
  assert.deepEqual(command.payload.chn_list.map(v => [v.chn, v.sensor]), views.map(v => [v.channel, v.view]));
  assert.deepEqual(command.payload.stitch_resolution, { width: 3840, height: 2160 });
});
test("stop and keepalive packets are untouched; unsupported topology fails closed", () => {
  for (const input of [packet(1004), Buffer.from("keepalive")]) assert.equal(gridStart(input, views, { width: 1920, height: 1080 }), input);
  assert.throws(() => gridStart(packet(), views.slice(1), { width: 1920, height: 1080 }), /invalid_grid_views/);
  assert.throws(() => gridStart(packet(), views, { width: 1920, height: 2160 }), /invalid_grid_resolution/);
  const input = packet(); input.writeUInt32LE(1, 6);
  assert.throws(() => gridStart(input, views, { width: 1920, height: 1080 }), /unexpected_sdk_start/);
});
test("invalid stored login is rejected before constructing any client", async () => {
  await assert.rejects(qualifyGrid({ isSessionValid: () => false }, {}, {}), /cached_session_unusable/);
});
