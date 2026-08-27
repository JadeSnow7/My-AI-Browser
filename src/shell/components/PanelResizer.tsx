import React, { useCallback, useEffect, useRef } from "react";

/**
 * Drag handle for a panel edge.
 *
 * The subtle part is not the arithmetic, it is that page views are native
 * `WebContentsView`s composited *above* the Shell. The moment the pointer
 * crosses into a page during a drag, that view captures it and the Shell stops
 * receiving `pointermove` -- `setPointerCapture` cannot help, because the
 * events never reach this renderer at all. So a drag has to raise the Shell
 * above the pages for its duration (`onStart` sets `shellOnTop`), which is
 * exactly what that flag exists for.
 */
export function PanelResizer({
  axis,
  label,
  onStart,
  onMove,
  onEnd,
}: {
  /** "x": a vertical bar dragged horizontally. "y": a horizontal bar dragged vertically. */
  axis: "x" | "y";
  label: string;
  onStart: () => void;
  onMove: (clientPosition: number) => void;
  onEnd: () => void;
}): React.JSX.Element {
  const dragging = useRef(false);

  const stop = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    onEnd();
  }, [onEnd]);

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!dragging.current) return;
      event.preventDefault();
      onMove(axis === "x" ? event.clientX : event.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [axis, onMove, stop]);

  return (
    <div
      className={`resizer resizer-${axis}`}
      role="separator"
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      onPointerDown={(event) => {
        event.preventDefault();
        dragging.current = true;
        onStart();
      }}
    />
  );
}
