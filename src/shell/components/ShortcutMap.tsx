import React from "react";

/**
 * ⌘/ — the whole keyboard surface on one card.
 *
 * It lists surfaces rather than every command, because ⌘K already reaches
 * every command by name. The footer says so: this card is the map, the box is
 * the search.
 */
const SURFACES: Array<[string, string]> = [
  ["⌘K", "Universal Shell"],
  ["⌘L", "Universal Shell with this URL"],
  ["⌘B", "Workspace Rail"],
  ["⌘I", "Context Panel"],
  ["⌘J", "Runtime Panel"],
  ["⌘\\", "Split View"],
  ["⌘⇧T", "New Task"],
  ["ESC", "Collapse all"],
];

export function ShortcutMap({
  onClose,
}: {
  onClose: () => void;
}): React.JSX.Element {
  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="keymap"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="keymap-group">Surfaces</p>
        {SURFACES.map(([key, name]) => (
          <div key={key} className="keymap-row">
            <span className="keymap-key">{key}</span>
            <span className="keymap-name">{name}</span>
          </div>
        ))}
        <p className="keymap-foot">
          Every surface is also reachable from ⌘K by name. Shown once on first
          run, then on ⌘/.
        </p>
      </div>
    </div>
  );
}
