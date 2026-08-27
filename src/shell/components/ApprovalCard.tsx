import React from "react";
import type { ApprovalRequest } from "../state/agent";

/**
 * The agent asking before it acts.
 *
 * Three decisions are load-bearing here:
 *
 * 1. **It shows the payload.** "Submit the order form" is a sentence you can
 *    approve without reading; the card names the host and lists the fields
 *    about to be sent, so approving is a decision rather than a reflex.
 * 2. **Three choices, not two.** Reject / Approve once / a standing grant
 *    scoped to *this site, in this task*. Without the third, users approve the
 *    same thing forty times and stop reading on the third.
 * 3. **Docked by default.** Only irreversible actions -- payments, deletions,
 *    anything published -- get the modal variant, because the modal raises the
 *    Shell and takes the page away. Interrupting the page is a cost, and it
 *    should be paid only where a wrong click cannot be undone.
 */
export function ApprovalCard({
  request,
  onReject,
  onApprove,
  onAlways,
}: {
  request: ApprovalRequest;
  onReject: () => void;
  onApprove: () => void;
  onAlways: () => void;
}): React.JSX.Element {
  const card = (
    <section
      className="approval"
      role={request.irreversible ? "alertdialog" : "dialog"}
      aria-label="Approval required"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="approval-head">
        <span className="approval-dot" />
        <span className="approval-title">Needs your approval</span>
        {request.irreversible && (
          <span className="approval-pill">irreversible</span>
        )}
      </header>

      <p className="approval-summary">
        {request.summary} <code>{request.host}</code>
      </p>

      <div className="approval-details">
        {request.details.map((detail) => (
          <div key={detail.key} className="approval-detail">
            <span className="approval-key">{detail.key}</span>
            <span
              className={
                detail.sensitive ? "approval-value sensitive" : "approval-value"
              }
            >
              {detail.value}
            </span>
          </div>
        ))}
      </div>

      <p className="approval-origin">
        <span className="approval-task">{request.taskName}</span> · {request.step}
      </p>

      <div className="approval-actions">
        <button className="secondary" onClick={onReject}>
          Reject
        </button>
        <button className="primary" onClick={onApprove}>
          Approve once
        </button>
      </div>

      <footer className="approval-foot">
        <button className="approval-always" onClick={onAlways}>
          {request.alwaysLabel}
        </button>
        <span className="approval-keys">esc · ⏎</span>
      </footer>
    </section>
  );

  return request.irreversible ? (
    <div className="scrim" onClick={onReject}>
      {card}
    </div>
  ) : (
    card
  );
}
