import React from "react";
import type { BrowserTab } from "../../shared/types";
import { useSelection } from "../state/selection";

/**
 * What you can do with what you just selected.
 *
 * The panel has two states and they are not the same panel with a filled box:
 * with nothing selected every action is disabled and the panel is explaining
 * itself; with a selection the quote is the subject and the actions are verbs
 * pointed at it. Keeping the disabled list visible in the empty state is
 * deliberate -- it is how you learn the panel is worth opening.
 */
const SELECTION_ACTIONS = [
  "Explain",
  "Ask Agent",
  "Research",
  "Save to Context",
  "Copy",
];

const RELATED_ACTIONS = ["Find similar", "Search the web", "Open in new tab"];

export function ContextPanel({
  tab,
  onClose,
  onAction,
}: {
  tab: BrowserTab | null;
  onClose: () => void;
  onAction: (action: string) => void;
}): React.JSX.Element {
  const selection = useSelection();

  return (
    <aside className="context-panel" aria-label="Context panel">
      <header className="panel-tabs">
        <span className="panel-title">Context</span>
        <span className="panel-key">⌘I</span>
        <button
          className="panel-close"
          aria-label="Close panel"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="panel-body">
        <p className="panel-section">Selection</p>
        {selection ? (
          <blockquote className="selection-box">
            <p className="selection-quote">“{selection.quote}”</p>
            <p className="selection-source">{selection.source}</p>
          </blockquote>
        ) : (
          <div className="selection-box">
            <p className="unwired-title">Nothing selected</p>
            <p className="unwired-source">
              {tab ? tab.url : "no active tab"}
            </p>
          </div>
        )}

        <div className="action-list">
          {SELECTION_ACTIONS.map((action) => (
            <button
              key={action}
              disabled={!selection}
              onClick={() => onAction(action)}
            >
              {action}
            </button>
          ))}
        </div>

        <p className="panel-section">Related</p>
        <div className="action-list">
          {RELATED_ACTIONS.map((action) => (
            <button
              key={action}
              disabled={!selection}
              onClick={() => onAction(action)}
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
