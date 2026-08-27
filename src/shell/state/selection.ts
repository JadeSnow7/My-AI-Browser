/**
 * The page selection behind the Context Panel.
 *
 * The real source is an isolated-world content script -- never the page's main
 * world, which the page itself can rewrite -- plus `DOM.getBoxModel` for
 * anchoring. That script does not exist yet, so this module fixes the shape
 * the panel reads and exposes the same dev-only seam as the agent channel.
 */

import { useEffect, useState } from "react";

export interface PageSelection {
  /** The selected text, already trimmed by the content script. */
  quote: string;
  /** Where it came from: host plus a section or heading anchor. */
  source: string;
}

type Listener = (selection: PageSelection | null) => void;

let current: PageSelection | null = null;
const listeners = new Set<Listener>();

export function publishSelection(selection: PageSelection | null): void {
  current = selection;
  listeners.forEach((listener) => listener(current));
}

export function useSelection(): PageSelection | null {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

declare global {
  interface Window {
    shellSelection?: { publish: typeof publishSelection };
  }
}

/** Dev-only seam; stripped from production by the same NODE_ENV substitution. */
if (process.env.NODE_ENV !== "production")
  window.shellSelection = { publish: publishSelection };
