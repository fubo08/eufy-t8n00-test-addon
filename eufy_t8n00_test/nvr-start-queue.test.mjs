import { test } from "node:test";
import assert from "node:assert/strict";
import { createStartQueue } from "../src/nvr-start-queue.mjs";

test("spaces starts while returning the first feed immediately", async () => {
  const run = createStartQueue(40);
  const starts = [];
  const first = await run(() => { starts.push(performance.now()); return "feed1"; });
  assert.equal(first, "feed1");
  assert.equal(await run(() => { starts.push(performance.now()); return "feed2"; }), "feed2");
  assert.ok(starts[1] - starts[0] >= 30);
});

test("waits for a slow negotiation and releases the queue after failure", async () => {
  const run = createStartQueue(0);
  let fail;
  let secondStarted = false;
  const first = run(() => new Promise((_, reject) => { fail = reject; }));
  const rejected = assert.rejects(first, /failed/);
  const second = run(() => { secondStarted = true; return "feed"; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(secondStarted, false);
  fail(new Error("failed"));
  await rejected;
  assert.equal(await second, "feed");
});

test("cancels a queued request without opening it or blocking later requests", async () => {
  const run = createStartQueue(0);
  let finish;
  const first = run(() => new Promise(resolve => { finish = resolve; }));
  const abort = new AbortController();
  let opened = false;
  const queued = run(() => { opened = true; }, abort.signal);
  const rejected = assert.rejects(queued, /cancelled/);
  abort.abort(new Error("cancelled"));
  await rejected;
  finish("first");
  await first;
  assert.equal(await run(() => "last"), "last");
  assert.equal(opened, false);
});
