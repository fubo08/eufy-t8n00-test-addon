import { Readable } from 'node:stream';

/** Bridge adapter for the public camera.live() API.
 * One consumer carries video and audio; SDK flow control bounds its queue.
 * Kept separate from the deployed bridge until qualification on the exact SDK commit.
 */
export async function openBetaLiveFeed(camera, { signal, view, onAudio = () => {} } = {}) {
  signal?.throwIfAborted();
  const consumer = await camera.live({ signal, view });
  let ended = false;
  const onAbort = () => feed.destroy();
  const feed = new Readable({
    objectMode: true,
    highWaterMark: 8,
    read() { consumer.resume(); },
    destroy(error, done) {
      ended = true;
      signal?.removeEventListener('abort', onAbort);
      consumer.stop();
      done(error);
    },
  });
  consumer.on('video', frame => {
    if (!ended && !feed.push(frame)) consumer.pause();
  });
  consumer.on('audio', frame => {
    if (ended) return;
    try { onAudio(frame); } catch (error) { feed.destroy(error); }
  });
  consumer.on('error', error => { if (!ended) feed.destroy(error); });
  consumer.on('stop', () => { if (!ended) feed.push(null); });
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) feed.destroy();
  return feed;
}
