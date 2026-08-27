import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_ORDER,
  MAX_PER_GROUP,
  buildResults,
  intentOf,
  nextIntent,
  queryBody,
  visibleGroups,
  type ResultGroup,
  type ShellContext,
} from "./intent";

const context = (query: string): ShellContext => ({
  query,
  activeUrl: "https://example.com/page",
  tabCount: 4,
  taskName: "Workspace",
  navigate: () => {},
  search: () => {},
  unwired: () => {},
  commands: [
    { name: "New Tab", hint: "command · ⌘T", run: () => {} },
    { name: "New Task", hint: "command · ⌘⇧T", run: () => {} },
    { name: "Close Tab", hint: "command · ⌘W", run: () => {} },
    { name: "Reload", hint: "command · ⌘R", run: () => {} },
    { name: "Split Right", hint: "command · ⌘\\", run: () => {} },
  ],
});

test("intent is derived from the query", () => {
  assert.equal(intentOf(""), "anything");
  assert.equal(intentOf("   "), "anything");

  assert.equal(intentOf("github.com"), "go");
  assert.equal(intentOf("github.com/openai/openai-cookbook"), "go");
  assert.equal(intentOf("localhost:5173"), "go");
  assert.equal(intentOf("localhost"), "go");

  assert.equal(intentOf("chromium accessibility"), "search");
  // A sentence that merely contains a dot is not a destination.
  assert.equal(intentOf("what is a .well-known file"), "search");

  assert.equal(intentOf("?summarise this"), "ask");
  assert.equal(intentOf("@page find the endpoints"), "ask");
  assert.equal(intentOf("/new tab"), "command");
  assert.equal(intentOf(">npm run build"), "shell");
});

test("prefixes win over shape", () => {
  // Otherwise ">github.com" would navigate instead of running a command.
  assert.equal(intentOf(">github.com"), "shell");
  assert.equal(intentOf("/github.com"), "command");
  assert.equal(intentOf("?github.com"), "ask");
});

test("tab cycles the intent ring without dropping into the empty state", () => {
  const seen = new Set<string>();
  let current = nextIntent("anything");
  for (let i = 0; i < 5; i++) {
    seen.add(current);
    assert.notEqual(current, "anything", "the empty state is not a choice");
    current = nextIntent(current);
  }
  assert.deepEqual([...seen].sort(), [
    "ask",
    "command",
    "go",
    "search",
    "shell",
  ]);
});

test("queryBody strips whichever prefix pinned the intent", () => {
  assert.equal(queryBody(">npm run build"), "npm run build");
  assert.equal(queryBody("/ new tab"), "new tab");
  assert.equal(queryBody("?why"), "why");
  assert.equal(queryBody("plain words"), "plain words");
});

/** The promise the footer makes: "groups never reorder". */
test("groups render in a fixed order regardless of the query", () => {
  const order = (query: string): ResultGroup[] => {
    const groups: ResultGroup[] = [];
    for (const result of buildResults(context(query)))
      if (groups[groups.length - 1] !== result.group) groups.push(result.group);
    return groups;
  };

  for (const query of ["", "reload", "github.com", "chromium docs"]) {
    const seen = order(query);
    const expected = GROUP_ORDER.filter((group) => seen.includes(group));
    assert.deepEqual(seen, expected, `query: ${JSON.stringify(query)}`);
  }
});

test("a group never contends for more than three rows", () => {
  // Five commands match the empty query; only three may be shown.
  const results = buildResults(context(""));
  for (const group of GROUP_ORDER)
    assert.ok(
      results.filter((r) => r.group === group).length <= MAX_PER_GROUP,
      `${group} exceeded ${MAX_PER_GROUP}`,
    );
});

test("a committed intent collapses the list to what it will do", () => {
  assert.deepEqual(visibleGroups("command"), ["Commands"]);
  assert.deepEqual(visibleGroups("shell"), ["Shell"]);
  assert.deepEqual(visibleGroups("ask"), ["Ask agent"]);
  assert.deepEqual(visibleGroups("go"), ["Navigate", "Search"]);
  assert.deepEqual(visibleGroups("anything"), GROUP_ORDER);

  const commandsOnly = buildResults(context("/re"));
  assert.ok(commandsOnly.length > 0);
  assert.ok(commandsOnly.every((r) => r.group === "Commands"));
  assert.ok(commandsOnly.some((r) => r.label[0].text === "Reload"));
});

test("the row that will change the world is marked before it is selected", () => {
  const acting = buildResults(context("")).filter((r) => r.acts);
  assert.ok(acting.length > 0);
  for (const result of acting)
    assert.match(result.consequence, /will act|shell/, result.consequence);
});

test("a typed destination is offered before the search fallback", () => {
  const results = buildResults(context("github.com/openai"));
  const navigate = results.findIndex((r) => r.group === "Navigate");
  const search = results.findIndex((r) => r.group === "Search");
  assert.ok(navigate >= 0 && search > navigate);
});

test("Enter runs the selected row's action", () => {
  let target: string | null = null;
  const ctx = { ...context("example.org"), navigate: (url: string) => (target = url) };
  const row = buildResults(ctx).find((r) => r.group === "Navigate");
  assert.ok(row);
  row.run();
  assert.equal(target, "example.org");
});
