# Borderless Browser Shell

An Electron shell for an agent-first browser: a chromeless window, a trusted
React UI layer, and one sandboxed renderer per tab, with a CDP session and a
memory policy underneath.

## Architecture

```text
BaseWindow                     (macOS: hiddenInset · elsewhere: frame:false)
├── Shell WebContentsView      trusted React + preload, always full-window
└── Page WebContentsView × N   remote, sandboxed, composited above the Shell
```

### Declarative layout

The Shell is the single source of truth for geometry. It measures its own DOM
(`LayoutProvider` + `ViewSlot`, via `ResizeObserver`) and publishes a
`LayoutSnapshot`; `LayoutApplier` in the main process applies it and computes
nothing. There is no `setShellLayout(top, sidebar, palette)` — panels and split
arrangements are CSS in the renderer and never reach the window controller.

```ts
interface LayoutSnapshot {
  revision: number;
  views: Array<{ tabId: string; rect: Rect; visible: boolean }>;
  shellOnTop: boolean;
}
```

**Stacking.** The Shell sits at the bottom of the child list and page views are
drawn above it, so pages receive their own clicks and the Shell only gets input
where it left a margin uncovered. `shellOnTop` raises the Shell above
everything for modal surfaces (command palette, and later Agent Lens and
approval cards), at the cost of swallowing all page input — which is exactly
what a modal wants. This is why the rail pushes content rather than floating
over it, and why it toggles on ⌘B instead of on hover.

If the Shell renderer never publishes (a broken build, a load failure), the
controller falls back after 3s to showing the active tab full-window rather
than leaving a blank window.

### Panels

The Runtime Panel (bottom) and Context Panel (right) hold five and two views
respectively. Where a source exists they show it; where one does not, the empty
state names the source still to be wired, so "nothing here" reads as "not wired
yet" rather than "broken".

They cost **zero main-process changes** — they are flex children in the Shell's
own DOM, the `.view-slot` elements shrink, and `LayoutProvider` republishes the
measured rectangles. That is the declarative layout paying for itself.

Two things the scaffold surfaced that a static mockup could not:

- **A drag has to raise the Shell.** Page views are native and composited above
  the Shell, so the instant the pointer crosses into a page the view captures it
  and `pointermove` stops arriving. `setPointerCapture` cannot help — the events
  never reach this renderer. `PanelResizer` therefore sets `shellOnTop` for the
  duration of the drag.
- **Escape cannot be taken from the page.** Pages use it to dismiss their own
  dialogs and to stop a load, so the main process forwards Escape *without*
  `preventDefault`, and Escape from a page collapses only modal surfaces. Full
  "collapse all" applies when the Shell itself has focus.

`clampPanels` in `shell/state/panels.ts` resolves rail and panel sizes against
the space that actually exists. Order of sacrifice:

1. **The rail degrades** from 240 to a 48px icon strip. It is navigation, not
   the task at hand, and it buys back more room than squeezing anything else.
2. **The context panel shrinks** toward its 260px minimum.
3. **A panel closes** only when even its minimum would push a pane below the
   floor of 420 x 300.

The rail degrade triggers on a *comfort* width (560px per pane), not the hard
floor. Gating on the floor left a band -- 1440 in split view was the worst case
-- where the rail stayed full and every pane sat a few pixels above unusable.
Evictions and degrades are announced in the top bar rather than silently
ignoring a shortcut.

Measured pane sizes at `topHeight = 30`:

| window | rail | + context | + runtime | + split |
|---|---|---|---|---|
| 1280 x 800 | 1032 x 762 | 720 x 762 | 720 x 510 | 455 x 510 (rail -> 48) |
| 1440 x 900 | 1192 x 862 | 880 x 862 | 880 x 610 | 535 x 610 (rail -> 48) |
| 1728 x 1117 | 1480 x 1079 | 1168 x 1079 | 1168 x 827 | 583 x 827 (rail kept) |

The first two columns are 8px short of the window in each axis: that is the
`EDGE_GUTTER` the edge handles live in, reserved only while the panel owning
that edge is closed. `panels.test.ts` pins this table.

So a design for the context panel has 260-560px to work with, the runtime panel
120-620px of height, and a page pane can be as narrow as 440px in split view.

### CDP sessions

`PageSession` owns one debugger attachment per tab; Console, Network, Agent
Lens and the agent's page tools all share it via domain reference counting.

A `webContents` target admits only one debugger client, so opening native
DevTools evicts us. The session absorbs that instead of letting each consumer
discover it: it yields on `devtools-opened` (status `suspended-devtools`, shown
in the UI as a badge), re-attaches on `devtools-closed`, retries an unexpected
detach with exponential backoff (250ms → 4s, then `error`), and replays every
enabled domain after each successful re-attach. `PageSessionManager` re-binds
the session when a discarded tab is restored into a new renderer, so
subscriptions survive hibernation.

### Tab hibernation

Each `WebContentsView` costs a renderer process, so background tabs are
discarded on a count-plus-idle policy: more than 8 live background tabs **and**
idle for over 10 minutes, oldest first, skipping anything currently audible.
A discarded tab keeps its `url`, `title` and scroll offset, so restoring it is
a reload that lands where the user left off. Cold start materializes only the
active tab; the rest come back as discarded records.

Both thresholds live in `main/tabs/hibernation.ts`; `selectForHibernation` is a
pure function over tab records, so the policy is testable without a window.

### Window controls

macOS uses `titleBarStyle: 'hiddenInset'` with a positioned traffic-light
inset, keeping the native buttons (and with them full-screen, Mission Control,
snapping and accessibility). Only Windows and Linux get `frame: false` plus the
Shell's own `WindowControls`. The Shell reserves `trafficLightInset` on macOS so
its chrome never sits under the buttons.

## Security boundary

Page renderers run with `nodeIntegration: false`, `contextIsolation: true`,
`sandbox: true`, no preload and no IPC. Every IPC channel asserts the sender is
the Shell view — the surface that will carry CDP passthrough, a terminal and
agent tools is worth guarding per channel, not once.

## Run

```bash
npm install
npm run build
npm run dev
```

## Tests

```bash
npm test
```

`node:test` over the compiled output, no new dependencies. The suite covers the
pure policy functions rather than the components: `clampPanels` (space
pressure and the measured table above), `selectForHibernation` (the count-plus-
idle policy and everything it must spare), `intentOf` / `buildResults` (intent
derivation and the fixed group order the Universal Shell promises), and
`groupTabs` / `pruneWorkspace`. These are the places where a refactor can
quietly change behaviour without breaking a type.

⌘/Ctrl + `K` Universal Shell · `L` Universal Shell prefilled with this URL ·
`B` workspace rail · `J` runtime panel · `I` context panel · `\` split view ·
`/` shortcut map · `⇧T` new task · `T`/`W`/`R` new/close/reload ·
`[`/`]` history · `ESC` collapse.

### The zero-chrome problem

Removing the chrome removed the affordances with it, so three things carry
discovery instead:

- **Edge handles.** Three 8px hit areas on the left, right and bottom edges,
  always present, naming the panel and its shortcut on hover. They are the only
  permanent chrome in the default state, and they are why the layout keeps
  `EDGE_GUTTER` uncovered on an edge whose panel is closed — pages composite
  above the Shell, so a handle under one would never see a pointer event.
- **The Universal Shell** (⌘K), which reaches every surface by name.
- **A first-run card** teaching exactly three keys, docked rather than modal so
  the page underneath stays live.

Presence is the inverse rule: the top strip shows an agent pill, an approval
pill or an error count *only while each is real*. An idle surface shows nothing,
which is what makes a glance at the corner worth taking.

### The Universal Shell

One box for navigate, search, ask, command and shell, replacing the separate
address bar and command palette. Two boxes meant deciding which one owned a
thought before having it.

Intent is **derived, never stored** — `intentOf(query)` in `state/intent.ts` is
a pure function, so the chip and what ⏎ does cannot drift apart. Results are
bucketed into a **fixed group order** regardless of match score: a list that
re-ranks under the cursor cannot be used by muscle memory, and this box is meant
to be. The right-hand column says what will happen (`open · ⏎`,
`ask · will act, asks first`) rather than which key does it, because the box can
spend money.

## Not yet built

Downloads, history, bookmarks, extensions, profiles, and the agent loop itself.
The layout model, the CDP session and the tab lifecycle are the substrate those
land on.

Console and Network are live — they subscribe to the tab's existing
`PageSession`. Terminal and Agent Log have their frames, typography and row
styles but no source: no pty behind Terminal, no event stream behind Agent Log,
and no isolated-world content script behind the Context Panel's selection.
There is no Agent Lens.

`state/agent.ts` and `state/selection.ts` fix the shape each of those will
publish, so landing a source is a matter of calling `publish` rather than
rewriting five components. Both expose a dev-only `window.shellAgent` /
`window.shellSelection` handle — stripped from production builds — because a
design you cannot look at is a design you cannot review.

Chrome state now persists in `localStorage` (`state/preferences.ts`): panel
sizes, the last runtime tab, rail state, and the launch count the first-run card
reads. Tab records still live in `browser-state.json`; tasks are a Shell-side
view over the tab list (`state/workspace.ts`) and the main process knows nothing
about them.
