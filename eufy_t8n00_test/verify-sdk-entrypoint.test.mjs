import assert from "node:assert/strict";
import test from "node:test";
import { EufyMega } from "../dist/index.js";

test("qualified package exports the public SDK client", () => {
  assert.equal(typeof EufyMega.prototype.getDevice, "function");
});
