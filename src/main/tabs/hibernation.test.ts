import test from "node:test";
import assert from "node:assert/strict";
import type { BrowserTab } from "../../shared/types";
import {
  defaultHibernationConfig,
  selectForHibernation,
  type HibernationCandidate,
} from "./hibernation";

const NOW = 1_000_000_000;
const IDLE = defaultHibernationConfig.idleMs;

const tab = (over: Partial<BrowserTab> & { id: string }): BrowserTab => ({
  title: over.id,
  url: `https://${over.id}.example`,
  state: "ready",
  active: false,
  lastActiveAt: NOW - IDLE - 1,
  discarded: false,
  ...over,
});

const candidates = (
  count: number,
  over: (index: number) => Partial<BrowserTab> = () => ({}),
): HibernationCandidate[] =>
  Array.from({ length: count }, (_, index) => ({
    tab: tab({ id: `t${index}`, ...over(index) }),
    audible: false,
  }));

test("spares everyone while under the count budget", () => {
  // The policy is count *plus* idle: three long-idle tabs must never reload
  // out from under the user just because they are old.
  const idleForever = candidates(3, () => ({ lastActiveAt: 0 }));
  assert.deepEqual(
    selectForHibernation(idleForever, defaultHibernationConfig, NOW),
    [],
  );
});

test("discards only the overage, oldest first", () => {
  // 11 live background tabs, budget 8 -> exactly 3 go, and they are the three
  // least recently touched.
  const live = candidates(11, (index) => ({
    lastActiveAt: NOW - IDLE - (11 - index),
  }));
  const victims = selectForHibernation(live, defaultHibernationConfig, NOW);
  assert.equal(victims.length, 3);
  assert.deepEqual(victims, ["t0", "t1", "t2"]);
});

test("over budget but not yet idle discards nothing", () => {
  const fresh = candidates(12, () => ({ lastActiveAt: NOW - IDLE + 1 }));
  assert.deepEqual(selectForHibernation(fresh, defaultHibernationConfig, NOW), []);
});

test("never discards the active tab", () => {
  const live = candidates(12, (index) => ({ active: index === 0 }));
  const victims = selectForHibernation(live, defaultHibernationConfig, NOW);
  assert.ok(!victims.includes("t0"));
});

test("audible tabs are spared even when they are the oldest", () => {
  const live = candidates(9, (index) => ({ lastActiveAt: NOW - IDLE - (9 - index) }));
  live[0].audible = true;
  const victims = selectForHibernation(live, defaultHibernationConfig, NOW);
  assert.deepEqual(victims, ["t1"]);
});

test("already-discarded and still-loading tabs do not count as live", () => {
  // Both would otherwise inflate the count and evict a tab that is fine.
  const mixed: HibernationCandidate[] = [
    ...candidates(8),
    { tab: tab({ id: "gone", discarded: true }), audible: false },
    { tab: tab({ id: "loading", state: "loading" }), audible: false },
  ];
  assert.deepEqual(selectForHibernation(mixed, defaultHibernationConfig, NOW), []);
});
