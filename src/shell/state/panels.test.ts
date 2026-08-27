import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPanels,
  initialPanels,
  CONTEXT_PANEL,
  RUNTIME_PANEL,
  RAIL_WIDTH,
  MIN_PANE,
  EDGE_GUTTER,
  type PanelState,
} from "./panels";

const TOP = 30;

const state = (over: Partial<PanelState> = {}): PanelState =>
  initialPanels(over);

const resolve = (
  panels: Partial<PanelState>,
  width: number,
  height: number,
  over: { rail?: boolean; panes?: number } = {},
) =>
  clampPanels(
    state(panels),
    { width, height },
    {
      sidebar: over.rail === false ? "hidden" : "open",
      topHeight: TOP,
      paneCount: over.panes ?? 1,
    },
  );

test("keeps an edge gutter only while that edge's panel is closed", () => {
  // The handles are the only permanent chrome in the default state, and they
  // cannot live under a page view. An open panel already holds that edge.
  const bare = resolve({}, 1280, 800, { rail: false });
  const withPanels = resolve(
    { contextOpen: true, runtimeOpen: true },
    1280,
    800,
    { rail: false },
  );

  assert.equal(
    bare.pane.width,
    1280 - RAIL_WIDTH.hidden - EDGE_GUTTER,
    "closed context panel leaves the right gutter",
  );
  assert.equal(
    withPanels.pane.width,
    1280 - RAIL_WIDTH.hidden - withPanels.panels.contextWidth,
    "open context panel reclaims the gutter",
  );
  assert.equal(
    withPanels.pane.height,
    800 - TOP - withPanels.panels.runtimeHeight,
    "open runtime panel reclaims the bottom gutter",
  );
});

test("the rail is the first thing to give, and it degrades rather than hides", () => {
  const tight = resolve({ contextOpen: true }, 1280, 800, { panes: 2 });
  assert.equal(tight.railCollapsed, true);
  assert.equal(tight.railWidth, RAIL_WIDTH.icon);
  // Degrading is not evicting: the panel that caused the pressure stays open.
  assert.equal(tight.panels.contextOpen, true);
  assert.deepEqual(tight.evicted, []);
});

test("the rail degrades on comfort width, not on the hard floor", () => {
  // The band this pins: 1440 in split view. Every pane is above MIN_PANE.width
  // but well under COMFORT_PANE_WIDTH, and gating on the floor left the rail
  // full while the panes sat a few pixels above unusable.
  const split = resolve({ contextOpen: true }, 1440, 900, { panes: 2 });
  assert.equal(split.railCollapsed, true);
  assert.ok(
    split.pane.width > MIN_PANE.width,
    "the floor alone would not have triggered a degrade",
  );

  // Wide enough to afford both: the rail must be kept.
  const roomy = resolve({ contextOpen: true }, 1728, 1117, { panes: 2 });
  assert.equal(roomy.railCollapsed, false);
  assert.equal(roomy.railWidth, RAIL_WIDTH.open);
});

test("the context panel shrinks toward its minimum before it closes", () => {
  // Width chosen to leave less than the requested 320 but more than the 260
  // minimum once the pane floor is taken out.
  const squeezed = resolve({ contextOpen: true, contextWidth: 560 }, 940, 800, {
    rail: false,
  });
  assert.equal(squeezed.panels.contextOpen, true);
  assert.ok(squeezed.panels.contextWidth < 560);
  assert.ok(squeezed.panels.contextWidth >= CONTEXT_PANEL.min);
  assert.ok(squeezed.pane.width >= MIN_PANE.width);
});

test("a panel closes only when even its minimum breaks the pane floor", () => {
  const evicted = resolve({ contextOpen: true }, 640, 800, { rail: false });
  assert.equal(evicted.panels.contextOpen, false);
  assert.deepEqual(evicted.evicted, ["context"]);
});

test("the runtime panel is evicted on height the same way", () => {
  const roomy = resolve({ runtimeOpen: true }, 1280, 800, { rail: false });
  assert.equal(roomy.panels.runtimeOpen, true);
  assert.equal(roomy.panels.runtimeHeight, RUNTIME_PANEL.initial);

  const squeezed = resolve({ runtimeOpen: true }, 1280, 500, { rail: false });
  assert.ok(squeezed.panels.runtimeHeight < RUNTIME_PANEL.initial);
  assert.ok(squeezed.panels.runtimeHeight >= RUNTIME_PANEL.min);

  const evicted = resolve({ runtimeOpen: true }, 1280, 400, { rail: false });
  assert.equal(evicted.panels.runtimeOpen, false);
  assert.deepEqual(evicted.evicted, ["runtime"]);
});

test("stored sizes outside the legal range are clamped, not trusted", () => {
  const huge = resolve(
    { contextOpen: true, contextWidth: 9999, runtimeOpen: true, runtimeHeight: 9999 },
    1920,
    1200,
    { rail: false },
  );
  assert.equal(huge.panels.contextWidth, CONTEXT_PANEL.max);
  assert.equal(huge.panels.runtimeHeight, RUNTIME_PANEL.max);
});

/**
 * The table in the README. These are the numbers a panel design has to fit
 * into, so they are worth pinning: a change here is a change to what the
 * Context Panel and Runtime Panel are allowed to assume.
 */
test("measured pane sizes at topHeight = 30", () => {
  const row = (width: number, height: number) => ({
    rail: resolve({}, width, height).pane,
    context: resolve({ contextOpen: true }, width, height).pane,
    runtime: resolve({ contextOpen: true, runtimeOpen: true }, width, height).pane,
    split: resolve({ contextOpen: true, runtimeOpen: true }, width, height, {
      panes: 2,
    }),
  });

  const small = row(1280, 800);
  assert.deepEqual(small.rail, { width: 1032, height: 762 });
  assert.deepEqual(small.context, { width: 720, height: 762 });
  assert.deepEqual(small.runtime, { width: 720, height: 510 });
  assert.deepEqual(small.split.pane, { width: 455, height: 510 });
  assert.equal(small.split.railWidth, RAIL_WIDTH.icon);

  const medium = row(1440, 900);
  assert.deepEqual(medium.rail, { width: 1192, height: 862 });
  assert.deepEqual(medium.context, { width: 880, height: 862 });
  assert.deepEqual(medium.runtime, { width: 880, height: 610 });
  assert.deepEqual(medium.split.pane, { width: 535, height: 610 });
  assert.equal(medium.split.railWidth, RAIL_WIDTH.icon);

  const large = row(1728, 1117);
  assert.deepEqual(large.rail, { width: 1480, height: 1079 });
  assert.deepEqual(large.context, { width: 1168, height: 1079 });
  assert.deepEqual(large.runtime, { width: 1168, height: 827 });
  assert.deepEqual(large.split.pane, { width: 583, height: 827 });
  assert.equal(large.split.railWidth, RAIL_WIDTH.open, "rail kept at 1728");
});
