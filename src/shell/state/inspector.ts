/**
 * Console and Network feeds for the Runtime Panel.
 *
 * `PageSession` already owns one debugger attachment per tab and reference-
 * counts the domains on it, so these two panels are subscribers rather than
 * new machinery: ask for the domains while the panel is on screen, drop them
 * when it is not, and let the session deal with DevTools stealing the target.
 *
 * Both feeds are capped ring buffers. An unbounded console is a memory leak
 * with a scrollbar, and nobody reads the ten-thousandth row.
 */

import { useEffect, useMemo, useState } from "react";
import type { CdpDomain } from "../../shared/cdp";
import type { BrowserEvent } from "../../shared/browser-event";

const LIMIT = 500;

export interface ConsoleEntry {
  id: number;
  level: "error" | "warning" | "info" | "log";
  text: string;
  source: string;
}

export interface NetworkEntry {
  id: string;
  status: number | null;
  name: string;
  size: number | null;
  /** Milliseconds, once the response has landed. */
  time: number | null;
  startedAt: number;
  failed?: boolean;
}

interface RuntimeConsoleCall {
  type?: string;
  args?: Array<{ value?: unknown; description?: string }>;
  stackTrace?: { callFrames?: Array<{ url?: string; lineNumber?: number }> };
}

interface LogEntryAdded {
  entry?: { level?: string; text?: string; url?: string; lineNumber?: number };
}

interface RequestWillBeSent {
  requestId?: string;
  request?: { url?: string };
  timestamp?: number;
}

interface ResponseReceived {
  requestId?: string;
  response?: { status?: number; encodedDataLength?: number };
}

interface LoadingFinished {
  requestId?: string;
  encodedDataLength?: number;
  timestamp?: number;
}

const frameSource = (call: RuntimeConsoleCall): string => {
  const frame = call.stackTrace?.callFrames?.[0];
  if (!frame?.url) return "";
  const file = frame.url.split("/").pop() || frame.url;
  return frame.lineNumber === undefined ? file : `${file}:${frame.lineNumber + 1}`;
};

const argText = (call: RuntimeConsoleCall): string =>
  (call.args ?? [])
    .map((arg) =>
      arg.value !== undefined ? String(arg.value) : (arg.description ?? ""),
    )
    .join(" ");

const levelOf = (type: string | undefined): ConsoleEntry["level"] =>
  type === "error" || type === "assert"
    ? "error"
    : type === "warning"
      ? "warning"
      : type === "info" || type === "debug"
        ? "info"
        : "log";

const shortName = (url: string): string => {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last || parsed.hostname;
  } catch {
    return url;
  }
};

/**
 * Subscribe the active tab's session to `domains` while `active` holds.
 *
 * Unsubscribing on close matters: the domains are reference-counted, so a
 * panel that never releases them keeps CDP traffic flowing for a surface
 * nobody is looking at.
 */
function useDomains(
  tabId: string | null,
  domains: CdpDomain[],
  active: boolean,
): void {
  // The array identity changes every render at the call site; key on contents.
  const key = domains.join(",");
  useEffect(() => {
    if (!tabId || !active) return;
    const list = key.split(",") as CdpDomain[];
    void window.browser.cdp.subscribe(tabId, list);
    return () => {
      void window.browser.cdp.unsubscribe(tabId, list);
    };
  }, [tabId, key, active]);
}

export function useConsoleFeed(
  tabId: string | null,
  active: boolean,
): ConsoleEntry[] {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  useDomains(tabId, ["Runtime", "Log"], active);

  // A new tab is a new console; keeping the old rows would attribute one
  // page's errors to another.
  useEffect(() => setEntries([]), [tabId]);

  useEffect(() => {
    if (!tabId || !active) return;
    let next = 0;
    const push = (entry: Omit<ConsoleEntry, "id">): void =>
      setEntries((current) =>
        [...current, { ...entry, id: next++ }].slice(-LIMIT),
      );

    return window.browser.subscribe((event: BrowserEvent) => {
      if (event.type !== "cdp.event" || event.tabId !== tabId) return;
      if (event.method === "Runtime.consoleAPICalled") {
        const call = event.params as RuntimeConsoleCall;
        push({
          level: levelOf(call.type),
          text: argText(call),
          source: frameSource(call),
        });
      } else if (event.method === "Log.entryAdded") {
        const { entry } = event.params as LogEntryAdded;
        if (!entry) return;
        push({
          level: levelOf(entry.level),
          text: entry.text ?? "",
          source: entry.url ? shortName(entry.url) : "",
        });
      }
    });
  }, [tabId, active]);

  return entries;
}

export function useNetworkFeed(
  tabId: string | null,
  active: boolean,
): NetworkEntry[] {
  const [rows, setRows] = useState<Map<string, NetworkEntry>>(new Map());
  useDomains(tabId, ["Network"], active);

  useEffect(() => setRows(new Map()), [tabId]);

  useEffect(() => {
    if (!tabId || !active) return;
    const update = (
      id: string,
      patch: Partial<NetworkEntry>,
      seed?: NetworkEntry,
    ): void =>
      setRows((current) => {
        const existing = current.get(id) ?? seed;
        if (!existing) return current;
        const next = new Map(current);
        next.set(id, { ...existing, ...patch });
        // Ring-buffer by insertion order: Map preserves it, so the oldest
        // keys are simply the first ones out.
        if (next.size > LIMIT)
          for (const key of [...next.keys()].slice(0, next.size - LIMIT))
            next.delete(key);
        return next;
      });

    return window.browser.subscribe((event: BrowserEvent) => {
      if (event.type !== "cdp.event" || event.tabId !== tabId) return;
      if (event.method === "Network.requestWillBeSent") {
        const params = event.params as RequestWillBeSent;
        if (!params.requestId) return;
        update(
          params.requestId,
          {},
          {
            id: params.requestId,
            status: null,
            name: shortName(params.request?.url ?? ""),
            size: null,
            time: null,
            startedAt: (params.timestamp ?? 0) * 1000,
          },
        );
      } else if (event.method === "Network.responseReceived") {
        const params = event.params as ResponseReceived;
        if (!params.requestId) return;
        update(params.requestId, { status: params.response?.status ?? null });
      } else if (event.method === "Network.loadingFinished") {
        const params = event.params as LoadingFinished;
        if (!params.requestId) return;
        setRows((current) => {
          const existing = current.get(params.requestId!);
          if (!existing) return current;
          const next = new Map(current);
          next.set(existing.id, {
            ...existing,
            size: params.encodedDataLength ?? existing.size,
            time: params.timestamp
              ? Math.max(0, params.timestamp * 1000 - existing.startedAt)
              : existing.time,
          });
          return next;
        });
      } else if (event.method === "Network.loadingFailed") {
        const params = event.params as { requestId?: string };
        if (params.requestId) update(params.requestId, { failed: true });
      }
    });
  }, [tabId, active]);

  return useMemo(() => [...rows.values()], [rows]);
}
