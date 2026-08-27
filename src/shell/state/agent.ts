/**
 * Agent run state: the shape, not the source.
 *
 * The agent loop does not exist yet. Rather than fake a run, this module fixes
 * the contract every agent-facing surface reads -- the presence pill, the
 * progress hairline, the Agent Log tab and the approval card -- so landing the
 * real event stream is a matter of calling `publish`, not of rewriting five
 * components.
 *
 * In development the same entry point is exposed on `window.shellAgent`, which
 * is how the designed states are reachable before the backend is.
 */

import { useEffect, useState } from "react";

export type StepStatus = "done" | "running" | "pending" | "failed";

export interface AgentStep {
  id: string;
  status: StepStatus;
  text: string;
  /** Element ordinal the agent addressed, shared with Agent Lens numbering. */
  target?: number;
  /** Human-readable duration; `running` steps show "now" instead. */
  elapsed?: string;
}

export interface AgentRun {
  taskId: string;
  taskName: string;
  step: number;
  total: number;
  steps: AgentStep[];
}

export interface ApprovalRequest {
  id: string;
  /** One sentence naming the action, with `host` called out in the card. */
  summary: string;
  host: string;
  /**
   * The payload a generic sentence would hide. An approval that does not show
   * what is about to be sent is a habit, not a decision.
   */
  details: Array<{ key: string; value: string; sensitive?: boolean }>;
  taskName: string;
  step: string;
  /** Irreversible actions get the modal variant and the pill. */
  irreversible: boolean;
  /** Wording for the third choice: a standing grant, scoped to site and task. */
  alwaysLabel: string;
}

export interface AgentChannel {
  run: AgentRun | null;
  approval: ApprovalRequest | null;
  /** Console errors on the active page, for the presence area. */
  consoleErrors: number;
}

const EMPTY: AgentChannel = { run: null, approval: null, consoleErrors: 0 };

type Listener = (state: AgentChannel) => void;

let state: AgentChannel = EMPTY;
const listeners = new Set<Listener>();

/** The seam the real agent process will write to. */
export function publish(next: Partial<AgentChannel>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
}

export function useAgentChannel(): AgentChannel {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    setValue(state);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

declare global {
  interface Window {
    shellAgent?: { publish: typeof publish; reset: () => void };
  }
}

/**
 * Dev-only handle. Every agent surface is otherwise unreachable until the loop
 * lands, and a design you cannot look at is a design you cannot review.
 *
 * Vite substitutes `process.env.NODE_ENV` at build time, so the branch and the
 * global vanish from a production bundle rather than shipping a debug seam.
 */
if (process.env.NODE_ENV !== "production")
  window.shellAgent = { publish, reset: () => publish(EMPTY) };
