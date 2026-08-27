import React from "react";
import type { CdpSessionState } from "../../shared/cdp";

const LABEL: Record<CdpSessionState["status"], string | null> = {
  detached: null,
  attached: null,
  "suspended-devtools": "DevTools has the target",
  reconnecting: "Reconnecting inspector…",
  error: "Inspector unavailable",
};

/**
 * Surfaces the one CDP state the user can actually cause: opening native
 * DevTools evicts our session, so Console/Network/Agent Lens degrade instead of
 * silently going stale.
 */
export function SessionBadge({
  session,
}: {
  session?: CdpSessionState;
}): React.JSX.Element | null {
  const label = session ? LABEL[session.status] : null;
  if (!label) return null;
  return (
    <span className={`session-badge ${session!.status}`} title={session!.reason}>
      {label}
    </span>
  );
}
