import React from "react";
import type { AgentRun } from "../state/agent";

/**
 * The right end of the top strip, and the hairline under it.
 *
 * The rule that makes this readable: **an idle surface shows nothing at all.**
 * No zeroes, no grey "0 errors", no placeholder pills. Anything visible here
 * is a thing that is actually happening, which is what makes a glance at the
 * corner worth taking.
 */
export function Presence({
  run,
  approvals,
  consoleErrors,
  onOpenAgentLog,
  onOpenConsole,
  onOpenApproval,
}: {
  run: AgentRun | null;
  approvals: number;
  consoleErrors: number;
  onOpenAgentLog: () => void;
  onOpenConsole: () => void;
  onOpenApproval: () => void;
}): React.JSX.Element {
  return (
    <div className="presence">
      {run && (
        <button className="presence-pill is-agent" onClick={onOpenAgentLog}>
          <span className="presence-dot" />
          {run.step}/{run.total}
        </button>
      )}
      {approvals > 0 && (
        <button className="presence-pill is-approval" onClick={onOpenApproval}>
          <span className="presence-dot" />
          {approvals} to approve
        </button>
      )}
      {consoleErrors > 0 && (
        <button className="presence-pill is-errors" onClick={onOpenConsole}>
          <span className="presence-dot" />
          {consoleErrors}
        </button>
      )}
    </div>
  );
}

/**
 * A 2px hairline along the bottom of the top strip. It exists only while an
 * agent is running: a permanently-present empty track would be one more thing
 * to ignore, and ignoring the progress bar is exactly the failure mode.
 */
export function AgentProgress({
  run,
}: {
  run: AgentRun | null;
}): React.JSX.Element | null {
  if (!run) return null;
  const percent = run.total === 0 ? 0 : (run.step / run.total) * 100;
  return (
    <div className="agent-progress">
      <div className="agent-progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
