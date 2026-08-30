# AGENTS.md — My-AI-Browser (Borderless Browser Shell)

This file governs agent work inside this repo. It is a sub-project of the
HUSH federated workspace (see the root repo's `workspace.yaml` and
`AGENTS.md`) but is versioned and reviewed independently — this repo has
its own history and remote (`github.com/JadeSnow7/My-AI-Browser`).

## Product boundary — read this first

**This product line is frozen (ADR-0007, root repo `docs/decisions/0007.md`).**
Until the Phase 2.5 Browser protocol experiment (a 1-week, hard-timeboxed
effort against a fake adapter, tracked in the `hush-runtime` repo once it
exists) resolves, this repo only accepts:

- Protocol-experiment-scoped tasks feeding Phase 2.5's acceptance criteria
  (capability/schema registration, read-only vs. side-effecting policy
  distinction, shared Event/Evidence envelope, idempotent mutable-state
  actions).
- Baseline maintenance (dependency bumps needed to keep CI green, etc.).

No general product feature work (new UI, new panels, new browser
capabilities) until that freeze lifts by explicit Owner decision.

## Architecture

An Electron shell for an agent-first browser: a chromeless `BaseWindow`
hosting a trusted Shell `WebContentsView` (React UI, always full-window)
and one sandboxed Page `WebContentsView` per tab, composited above the
Shell.

- **Declarative layout.** The Shell is the single source of truth for
  geometry: it measures its own DOM (`LayoutProvider` + `ViewSlot` via
  `ResizeObserver`) and publishes a `LayoutSnapshot`; `LayoutApplier` in
  the main process applies it and computes nothing. There is no imperative
  `setShellLayout(...)` call — panel/split arrangements are CSS in the
  renderer and never reach the window controller. `shellOnTop` raises the
  Shell above page content for modal surfaces (command palette, drags,
  future Agent Lens/approval cards).
- **Panels.** Runtime Panel (bottom) and Context Panel (right); sizing
  resolved by `clampPanels` in `shell/state/panels.ts` against available
  space (rail degrades first, then context panel shrinks, then a panel
  closes as a last resort — see the README's measured-size table, pinned
  by `panels.test.ts`).
- **CDP sessions.** `PageSession` owns one debugger attachment per tab;
  Console, Network, Agent Lens, and agent page tools share it via domain
  reference counting. `PageSessionManager` re-binds sessions across tab
  hibernation/restore.
- **Tab hibernation.** Count-plus-idle discard policy (`main/tabs/hibernation.ts`,
  pure function `selectForHibernation`): discards background tabs past a
  live-tab-count threshold AND an idle threshold, oldest first, never the
  active or an audible tab.
- **Security boundary.** Page renderers: `nodeIntegration: false`,
  `contextIsolation: true`, `sandbox: true`, no preload, no IPC. Every IPC
  channel asserts the sender is the Shell view.
- **Not yet built:** downloads, history, bookmarks, extensions, profiles,
  and the agent loop itself. Terminal and Agent Log panels have frames but
  no live source yet. See the README's "Not yet built" section for the
  exact wiring points (`state/agent.ts`, `state/selection.ts`).

Full architectural detail (including the Universal Shell, top-strip
behavior, and the zero-chrome affordance design) lives in `README.md` —
this file summarizes it for agent orientation, it doesn't replace it.

## Commands (baseline, verified 2026-08-30)

```bash
npm install          # deps
npm run typecheck    # tsc --noEmit
npm run build         # tsc && vite build
npm test              # tsc && node --test "dist/**/*.test.js"
npm run dev            # npm run build && electron .
```

Baseline result in this checkout (Node v26.5.0, npm 11.17.0, commit
`acb772501c19b3d3aa0d80d8c72faf0f44aaa614`):

- `typecheck`: clean, no errors.
- `build`: succeeds (`tsc` + `vite build`, 56 modules, ~357ms).
- `test`: 61/62 `node:test` cases pass. The one failure
  (`dist/main/tabs/tab-manager.test.js`) is not a code defect — `npm install`
  in this sandbox blocked the `electron` package's postinstall script
  (`npm warn allow-scripts`), so the Electron binary never finished
  installing and `require('electron')` throws. Re-running with install
  scripts allowed (`npm approve-scripts --allow-scripts-pending` or
  equivalent) should resolve it; not attempted here as it's an environment
  permission question, not a repo fix.

## Single-writer / scope

Tasks against this repo declare a path whitelist per root `AGENTS.md`'s
task-declaration template. Cross-repo changes (e.g. a shared tool-protocol
contract) are separate tasks against `contracts/` in the HUSH root repo,
not silently bundled into a browser-repo commit.
