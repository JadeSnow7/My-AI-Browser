import React from "react";

/**
 * Only rendered where the OS does not draw window buttons for us. On macOS the
 * window uses `titleBarStyle: 'hiddenInset'`, so the real traffic lights are
 * present and these would be a broken duplicate.
 */
export function WindowControls(): React.JSX.Element {
  return (
    <span className="window-buttons">
      <button
        aria-label="Minimize"
        onClick={() => void window.browser.windowAction("minimize")}
      >
        −
      </button>
      <button
        aria-label="Maximize"
        onClick={() => void window.browser.windowAction("maximize")}
      >
        □
      </button>
      <button
        aria-label="Close"
        onClick={() => void window.browser.windowAction("close")}
      >
        ×
      </button>
    </span>
  );
}
