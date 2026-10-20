import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { openBetaLiveFeed } from './nvr-beta-live-feed.mjs';

function camera() {
  const consumer = new EventEmitter();
  consumer.pause = () => consumer.pauses++;
  consumer.resume = () => consumer.resumes++;
  consumer.stop = () => consumer.stops++;
  Object.assign(consumer, { pauses: 0, resumes: 0, stops: 0 });
  const calls = [];
  return { consumer, calls, live: async opts => { calls.push(opts); return consumer; } };
}

test('one public consumer forwards video and audio unchanged and stops on close', async () => {
  const cam = camera(), audio = [];
  const feed = await openBetaLiveFeed(cam, { onAudio: f => audio.push(f) });
  const video = { data: Buffer.from([0,0,0,1,0x65]), codec: 'h264', timestampMs: 12345 };
  const sound = { data: Buffer.from([1,2]), codec: 'g711a', timestampMs: 12346 };
  cam.consumer.emit('video', video);
  cam.consumer.emit('audio', sound);
  assert.equal(feed.read(), video);
  assert.equal(audio[0], sound);
  assert.equal(cam.calls.length, 1);
  assert.equal('sensor' in cam.calls[0], false);
  feed.destroy();
  await once(feed, 'close');
  assert.equal(cam.consumer.stops, 1);
});

test('slow video reader applies backpressure to the shared audio/video consumer', async () => {
  const cam = camera();
  const feed = await openBetaLiveFeed(cam);
  for (let i=0; i<8; i++) cam.consumer.emit('video', { timestampMs:i });
  assert.equal(cam.consumer.pauses, 1);
  feed.read();
  assert.ok(cam.consumer.resumes > 0);
  feed.destroy();
});

test('abort while live is opening still releases the eventual consumer', async () => {
  const cam = camera(), abort = new AbortController();
  let release;
  cam.live = () => new Promise(resolve => { release = resolve; });
  const pending = openBetaLiveFeed(cam, { signal: abort.signal });
  abort.abort();
  release(cam.consumer);
  const feed = await pending;
  assert.equal(feed.destroyed, true);
  assert.equal(cam.consumer.stops, 1);
});

test('audio sink failure terminates the consumer and surfaces the error', async () => {
  const cam = camera();
  const feed = await openBetaLiveFeed(cam, { onAudio: () => { throw new Error('synthetic sink'); } });
  const failure = once(feed, 'error');
  cam.consumer.emit('audio', {});
  assert.equal((await failure)[0].message, 'synthetic sink');
  assert.equal(cam.consumer.stops, 1);
});

test('an optical view is passed unchanged through the public live caller', async () => {
  const cam = camera();
  const feed = await openBetaLiveFeed(cam, { view:1 });
  assert.equal(cam.calls[0].view,1);
  assert.equal('sensor' in cam.calls[0],false);
  feed.destroy();
});
