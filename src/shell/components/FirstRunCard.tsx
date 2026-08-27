import React from "react";

/**
 * Three keys, docked bottom-left, non-modal.
 *
 * Deliberately not a tour and not a modal. It teaches the three keys that
 * unlock every other surface and then gets out of the way -- ⌘K reaches
 * everything by name, ⌘/ lists the rest, ESC puts it all away. Anything more
 * would be a manual for a browser nobody has used yet.
 *
 * Non-modal matters structurally: the Shell stays *below* the page views, so
 * the page underneath is still live and clickable. A modal card would have to
 * raise the Shell and swallow every page click to teach a shortcut.
 */
const KEYS = [
  {
    key: "⌘K",
    text: "One box to navigate, search, ask, or run — every panel is in here by name.",
  },
  { key: "⌘/", text: "Every other shortcut, whenever you want it." },
  { key: "ESC", text: "Put everything away." },
];

export function FirstRunCard({
  onDismiss,
  onShortcuts,
}: {
  onDismiss: () => void;
  onShortcuts: () => void;
}): React.JSX.Element {
  return (
    <aside className="first-run" aria-label="Getting started">
      <header className="first-run-head">
        <h2>Three keys to start</h2>
        <button aria-label="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </header>

      {KEYS.map(({ key, text }) => (
        <div key={key} className="first-run-row">
          <span className="first-run-key">{key}</span>
          <span className="first-run-text">{text}</span>
        </div>
      ))}

      <div className="first-run-row gesture">
        <span className="first-run-grip" />
        <span className="first-run-text">
          Or move the pointer to the left, right, or bottom edge.
        </span>
      </div>

      <footer className="first-run-foot">
        <button className="secondary" onClick={onShortcuts}>
          See all shortcuts
        </button>
        <span className="first-run-hint">any key to dismiss</span>
      </footer>
    </aside>
  );
}
