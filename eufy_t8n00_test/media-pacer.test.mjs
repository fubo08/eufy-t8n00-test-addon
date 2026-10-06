import { test } from "node:test";
import assert from "node:assert/strict";
import { createMediaPacer } from "../src/media-pacer.mjs";
function fixture() {
  let time = 0, id = 0;
  const timers = new Map(), output = [], errors = [];
  let rebuffers = 0;
  const pacer = createMediaPacer({ delayMs: 1500, now: () => time,
    setTimer: (fn, delay) => { timers.set(++id, { at: time + delay, fn }); return id; },
    clearTimer: id => timers.delete(id), write: data => output.push([time, data.toString()]),
    onError: error => errors.push(error), onRebuffer: () => rebuffers++ });
  const advance = target => {
    for (;;) {
      const next = [...timers].sort((a,b) => a[1].at-b[1].at)[0];
      if (!next || next[1].at > target) break;
      timers.delete(next[0]); time = next[1].at; next[1].fn();
    }
    time = target;
  };
  return { pacer, output, errors, advance, rebuffers: () => rebuffers };
}
test("smooths a one-second delivery burst without changing AV payload order", () => {
  const s = fixture();
  s.pacer.push(Buffer.from("av0"), 0);
  s.advance(1000);
  for (let n=1;n<=4;n++) s.pacer.push(Buffer.from(`av${n}`), n*250);
  s.advance(2500);
  assert.deepEqual(s.output, [[1500,"av0"],[1750,"av1"],[2000,"av2"],[2250,"av3"],[2500,"av4"]]);
  assert.equal(s.rebuffers(),0);
  s.pacer.close();
});
test("rebuilds the reserve after a gap rather than flushing late frames immediately", () => {
  const s=fixture(); s.pacer.push(Buffer.from("a"),0); s.advance(4000);
  s.pacer.push(Buffer.from("b"),250); s.pacer.push(Buffer.from("c"),500);
  s.advance(5750);
  assert.deepEqual(s.output,[[1500,"a"],[5500,"b"],[5750,"c"]]);
  assert.equal(s.rebuffers(),1); s.pacer.close();
});
test("cancels pending output and bounds memory and source discontinuities", () => {
  const s=fixture(); s.pacer.push(Buffer.from("a"),100);
  assert.throws(()=>s.pacer.push(Buffer.from("b"),99),/backwards/);
  assert.throws(()=>s.pacer.push(Buffer.alloc(8*1024*1024),101),/8 MiB/);
  s.pacer.close(); s.advance(9000); assert.deepEqual(s.output,[]);
});
test("reports output failure once", () => {
  let errors=0;
  const p=createMediaPacer({delayMs:0,write(){throw Error("closed");},onError(){errors++;}});
  p.push(Buffer.from("a"),0);p.push(Buffer.from("b"),250);assert.equal(errors,1);
});
