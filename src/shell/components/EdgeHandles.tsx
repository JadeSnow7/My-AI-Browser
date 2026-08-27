import React, { useState } from "react";

/**
 * The only permanent chrome in the default state.
 *
 * A zero-chrome window has one real problem: nothing tells you the panels
 * exist. Three 8px hit areas along the left, right and bottom edges cost
 * almost no pixels, are always in the same place, and name the panel plus its
 * shortcut on hover -- so the pointer teaches the keyboard.
 *
 * They only work because the Shell keeps `EDGE_GUTTER` uncovered on an edge
 * whose panel is closed: page views are composited above the Shell, so a
 * handle under one would never see a pointer event.
 *
 * Each handle **toggles**. An affordance that only opens is a trap -- the
 * panel it opened has no matching way back, so the second click on the same
 * spot does nothing and the control reads as broken.
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
  onToggle,
}: {
  /** Which panels are showing -- the hover label says what the click will do. */
  open: Record<Edge, boolean>;
  topHeight: number;
  onToggle: (edge: Edge) => void;
}): React.JSX.Element {
  const [hover, setHover] = useState<Edge | null>(null);

  return (
    <>
      {(Object.keys(LABEL) as Edge[]).map((edge) => (
        open.bottom && edge === "bottom" ? null :
        <div
          key={edge}
          className={[
            "edge",
            `edge-${edge}`,
            open[edge] ? "is-open" : "",
            hover === edge ? "is-hover" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            edge === "left" || edge === "right" ? { top: topHeight } : undefined
          }
          role="button"
          tabIndex={-1}
          aria-label={`${open[edge] ? "Hide" : "Open"} ${LABEL[edge].name} panel`}
          onMouseEnter={() => setHover(edge)}
          onMouseLeave={() =>
            setHover((current) => (current === edge ? null : current))
          }
          onClick={() => onToggle(edge)}
        >
          <span className="edge-grip" />
          {hover === edge && (
            <span className="edge-label">
              <span className="edge-label-name">
                {open[edge] ? `Hide ${LABEL[edge].name}` : LABEL[edge].name}
              </span>
              <span className="edge-label-key">{LABEL[edge].key}</span>
            </span>
          )}
        </div>
      ))}
    </>
  );
}
