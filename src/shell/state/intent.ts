/**
 * The Universal Shell's intent router.
 *
 * One box has to navigate, search, ask and run without asking the user which
 * mode they meant. Two rules make that legible rather than magic:
 *
 * 1. **Intent is derived, never stored.** It is a pure function of the query,
 *    so what the chip says can never drift from what ⏎ will do.
 * 2. **Groups never reorder.** Results are bucketed and rendered in a fixed
 *    order regardless of match score. A list that re-ranks under the cursor
 *    cannot be used by muscle memory, and this box is meant to be.
 *
 * Everything here is pure, so the routing table is testable without a window.
 */

import { looksLikeAddress } from "../../shared/navigation";

export type Intent = "anything" | "go" | "search" | "ask" | "command" | "shell";

export type ResultGroup =
  | "Navigate"
  | "Search"
  | "Ask agent"
  | "Commands"
  | "Shell";

/** Render order. Fixed -- see rule 2 above. */
export const GROUP_ORDER: ResultGroup[] = [
  "Navigate",
  "Search",
  "Ask agent",
  "Commands",
  "Shell",
];

/** Typing this prefix pins the query to that group. Shown beside the heading. */
export const GROUP_PREFIX: Partial<Record<ResultGroup, string>> = {
  "Ask agent": "?",
  Commands: "/",
  Shell: ">",
};

/** A group that spends more than three rows stops being scannable. */
export const MAX_PER_GROUP = 3;

/**
 * Looks like somewhere to go rather than something to say: a dotted hostname,
 * or a bare `localhost` with an optional port.
 */
export const LOOKS_LIKE_URL = /^(?:https?:\/\/)?(?:[\w-]+(?:\.[a-z]{2,})+|localhost)(?::\d+)?(?:[/?#]|$)/i;

export function intentOf(query: string): Intent {
  const value = query.trim();
  if (value === "") return "anything";
  if (value.startsWith(">")) return "shell";
  if (value.startsWith("/")) return "command";
  if (value.startsWith("?") || value.startsWith("@")) return "ask";
  if (looksLikeAddress(value)) return "go";
  return "search";
}

/** The chip's label. Uppercased in CSS, so the source stays readable. */
export const INTENT_LABEL: Record<Intent, string> = {
  anything: "anything",
  go: "go",
  search: "search",
  ask: "ask",
  command: "command",
  shell: "shell",
};

/**
 * Which groups an intent admits. A committed intent collapses the list to the
 * one thing it will do; an ambiguous one shows every road out.
 */
export function visibleGroups(intent: Intent): ResultGroup[] {
  switch (intent) {
    case "command":
      return ["Commands"];
    case "shell":
      return ["Shell"];
    case "ask":
      return ["Ask agent"];
    case "go":
      return ["Navigate", "Search"];
    default:
      return GROUP_ORDER;
  }
}

/**
 * Tab cycles the intent without touching the text: the same sentence, executed
 * a different way. Only the intents a user can mean by typing are in the ring
 * -- `anything` is the empty state, not a choice.
 */
const RING: Intent[] = ["go", "search", "ask", "command", "shell"];

export function nextIntent(current: Intent): Intent {
  const index = RING.indexOf(current);
  return RING[(index + 1) % RING.length];
}

/** Strip whichever prefix pinned the intent, leaving the user's actual words. */
export function queryBody(query: string): string {
  return query.replace(/^[>/?@]\s*/, "").trim();
}

/** A label split so `@page` can be tinted without raw HTML. */
export interface Segment {
  text: string;
  tone?: "mention" | "dim";
}

export interface ShellResult {
  id: string;
  group: ResultGroup;
  /** Text glyph -- the design uses no icon font. */
  glyph: string;
  label: Segment[];
  /**
   * The right-hand column. Deliberately says what will happen rather than
   * which key does it: a list of shortcuts teaches nothing about consequences.
   */
  consequence: string;
  /** True when the action changes the world, not just the view. */
  acts?: boolean;
  run: () => void;
}

export interface ShellContext {
  query: string;
  activeUrl: string;
  /** Tabs in the current task, for "search open tabs". */
  tabCount: number;
  taskName: string;
  navigate: (url: string) => void;
  search: (terms: string) => void;
  /** Surfaces that have a design but no backend yet. */
  unwired: (what: string) => void;
  commands: Array<{ name: string; hint: string; run: () => void }>;
}

const mention = (text: string): Segment => ({ text, tone: "mention" });
const dim = (text: string): Segment => ({ text, tone: "dim" });
const plain = (text: string): Segment => ({ text });

/** Case-insensitive substring match; the only ranking this box does. */
const matches = (haystack: string, needle: string): boolean =>
  needle === "" || haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Build the rows for a query. Groups are assembled independently and then
 * filtered by intent, so adding a source cannot perturb the order of the rest.
 */
export function buildResults(context: ShellContext): ShellResult[] {
  const intent = intentOf(context.query);
  const body = queryBody(context.query);
  const allowed = new Set(visibleGroups(intent));
  const results: ShellResult[] = [];

  if (allowed.has("Navigate")) {
    if (body && looksLikeAddress(body))
      results.push({
        id: "nav:typed",
        group: "Navigate",
        glyph: "↗",
        label: [plain(body)],
        consequence: "open · ⏎",
        run: () => context.navigate(body),
      });
    if (context.activeUrl && matches(context.activeUrl, body))
      results.push({
        id: "nav:reload",
        group: "Navigate",
        glyph: "↗",
        label: [plain(context.activeUrl), dim(" · reload this tab")],
        consequence: "open",
        run: () => context.navigate(context.activeUrl),
      });
  }

  if (allowed.has("Search")) {
    results.push({
      id: "search:web",
      group: "Search",
      glyph: "⌕",
      label: body ? [plain(`Search the web for “${body}”`)] : [plain("Search the web")],
      consequence: "search",
      run: () => context.search(body),
    });
    results.push({
      id: "search:tabs",
      group: "Search",
      glyph: "⌕",
      label: [
        plain("Search open tabs"),
        dim(` · ${context.tabCount} in ${context.taskName}`),
      ],
      consequence: "search",
      run: () => context.unwired("tab search"),
    });
  }

  if (allowed.has("Ask agent")) {
    results.push({
      id: "ask:summarise",
      group: "Ask agent",
      glyph: "✳",
      label: body ? [plain(body)] : [plain("Summarise this page")],
      consequence: "ask · reads page",
      run: () => context.unwired("the agent loop"),
    });
    results.push({
      id: "ask:page",
      group: "Ask agent",
      glyph: "✳",
      label: [mention("@page"), plain(" find the API endpoints")],
      consequence: "ask · reads page",
      run: () => context.unwired("the agent loop"),
    });
    results.push({
      id: "ask:act",
      group: "Ask agent",
      glyph: "✳",
      label: [plain(body || "Do this for me")],
      // The one row that will touch the world says so in the danger colour,
      // before it is selected rather than after it has run.
      consequence: "ask · will act, asks first",
      acts: true,
      run: () => context.unwired("the agent loop"),
    });
  }

  if (allowed.has("Commands"))
    for (const command of context.commands) {
      if (!matches(command.name, body)) continue;
      results.push({
        id: `cmd:${command.name}`,
        group: "Commands",
        glyph: "⌗",
        label: [plain(command.name)],
        consequence: command.hint,
        run: command.run,
      });
    }

  if (allowed.has("Shell"))
    results.push({
      id: "shell:run",
      group: "Shell",
      glyph: "›",
      label: [plain(body || "Run a command")],
      consequence: "shell · in Terminal",
      acts: true,
      run: () => context.unwired("the terminal"),
    });

  // Cap each group, then emit in the fixed order. Sorting the flat list would
  // let a well-matched command jump above Navigate -- exactly the reordering
  // this box promises never to do.
  const capped: ShellResult[] = [];
  for (const group of GROUP_ORDER)
    capped.push(
      ...results.filter((r) => r.group === group).slice(0, MAX_PER_GROUP),
    );
  return capped;
}
