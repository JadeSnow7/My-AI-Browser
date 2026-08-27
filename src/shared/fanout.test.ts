import assert from "node:assert/strict";
import test from "node:test";
import { createFanout } from "./fanout";

test("fanout delivers once to each consumer and releases upstream on empty", () => {
  let starts = 0;
  let stops = 0;
  const fanout = createFanout<number>(() => starts++, () => stops++);
  const first: number[] = [];
  const second: number[] = [];
  const offFirst = fanout.subscribe((value) => first.push(value));
  const offSecond = fanout.subscribe((value) => second.push(value));
  assert.equal(starts, 1);
  fanout.publish(7);
  assert.deepEqual(first, [7]);
  assert.deepEqual(second, [7]);
  offFirst();
  fanout.publish(8);
  assert.deepEqual(first, [7]);
  assert.deepEqual(second, [7, 8]);
  offSecond();
  assert.equal(stops, 1);
  assert.equal(fanout.size(), 0);
});
