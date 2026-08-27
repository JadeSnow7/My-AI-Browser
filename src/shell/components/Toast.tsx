import React from "react";

/**
 * Transient notice, centred at the bottom.
 *
 * It moved out of the top strip on purpose. A red badge up in the chrome read
 * as a persistent error state for something that is neither persistent nor an
 * error -- a panel closing because the window got small is the layout doing
 * its job, and it just needs to be said out loud so the shortcut does not look
 * broken.
 */
export function Toast({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="toast" role="status">
      <span className="toast-dot" />
      {message}
    </div>
  );
}
