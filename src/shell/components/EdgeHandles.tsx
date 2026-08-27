import React, { useState } from "react";

/**
 * The only permanent chrome in the default state.
 *
 * A zero-chrome window has one real problem: nothing tells you the panels
 * exist. Three 8px hit areas along the left, right and bottom edges cost
 * almost no pixels, are always in the same place, and name the panel plus its
 * shortcut on hover -- so the pointer teaches the keyboard.
 *
 * They only work because the Shell keeps `EDGE_GUTTER` uncovered on the right
 * and bottom: page views are composited above the Shell, so a handle under one
 * would never see a pointer event.
 */
export type Edge = "left" | "right" | "bottom";

const LABEL: Record<Edge, { name: string; key: string }> = {
  left: { name: "Workspace", key: "⌘B" },
  right: { name: "Context", key: "⌘I" },
  bottom: { name: "Runtime", key: "⌘J" },
};

export function EdgeHandles({
  open,
  topHeight,
  onOpen,
}: {
  /** Which panels are already showing -- an open panel needs no signpost. */
  open: Record<Edge, boolean>;
  topHeight: number;
  onOpen: (edge: Edge) => void;
}): React.JSX.Element {
  const [hover, setHover] = useState<Edge | null>(null);

  return (
    <>
      {(Object.keys(LABEL) as Edge[]).map((edge) => (
        <div
          key={edge}
          className={`edge edge-${edge}`}
          style={edge === "left" || edge === "right" ? { top: topHeight } : undefined}
          role="button"
          tabIndex={-1}
          aria-label={`Open ${LABEL[edge].name} panel`}
          onMouseEnter={() => setHover(edge)}
          onMouseLeave={() => setHover((current) => (current === edge ? null : current))}
          onClick={() => onOpen(edge)}
        >
          <span className="edge-grip" />
          {hover === edge && !open[edge] && (
            <span className="edge-label">
              <span className="edge-label-name">{LABEL[edge].name}</span>
              <span className="edge-label-key">{LABEL[edge].key}</span>
            </span>
          )}
        </div>
      ))}
    </>
  );
}
