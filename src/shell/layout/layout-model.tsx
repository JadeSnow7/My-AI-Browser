import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { LayoutSnapshot, Rect, ViewPlacement } from "../../shared/layout";

interface LayoutRegistry {
  register: (tabId: string, element: HTMLElement | null) => void;
  remeasure: () => void;
}

const LayoutContext = createContext<LayoutRegistry | null>(null);

const toRect = (element: HTMLElement): Rect => {
  const box = element.getBoundingClientRect();
  return {
    x: Math.round(box.left),
    y: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
};

/**
 * Measures the Shell's own DOM and publishes the result to the main process.
 *
 * This is the whole point of the declarative layout: panes are ordinary CSS
 * boxes here, so Split View, the Runtime Panel and the Context Panel are
 * flexbox/grid changes rather than arithmetic in the window controller. The
 * main process never learns what a "sidebar" is.
 */
export function LayoutProvider({
  order,
  shellOnTop,
  children,
}: {
  /** Visible panes, back-to-front. */
  order: string[];
  shellOnTop: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const elements = useRef(new Map<string, HTMLElement>());
  const revision = useRef(0);
  const lastPublished = useRef("");
  const frame = useRef<number | null>(null);
  const state = useRef({ order, shellOnTop });
  state.current = { order, shellOnTop };

  const publish = useCallback(() => {
    const { order: currentOrder, shellOnTop: onTop } = state.current;
    const views: ViewPlacement[] = [];
    for (const tabId of currentOrder) {
      const element = elements.current.get(tabId);
      if (!element) continue;
      const rect = toRect(element);
      if (rect.width < 1 || rect.height < 1) continue;
      views.push({ tabId, rect, visible: true });
    }

    const signature = JSON.stringify({ views, onTop });
    if (signature === lastPublished.current) return;
    lastPublished.current = signature;

    const snapshot: LayoutSnapshot = {
      revision: ++revision.current,
      views,
      shellOnTop: onTop,
    };
    window.browser.layout(snapshot);
  }, []);

  const remeasure = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      publish();
    });
  }, [publish]);

  const observer = useMemo(
    () =>
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => remeasure()),
    [remeasure],
  );

  const register = useCallback(
    (tabId: string, element: HTMLElement | null) => {
      const existing = elements.current.get(tabId);
      if (existing === element) return;
      if (existing) observer?.unobserve(existing);
      if (element) {
        elements.current.set(tabId, element);
        observer?.observe(element);
      } else {
        elements.current.delete(tabId);
      }
      remeasure();
    },
    [observer, remeasure],
  );

  useEffect(() => {
    const onResize = () => remeasure();
    window.addEventListener("resize", onResize);
    observer?.observe(document.documentElement);
    return () => {
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [observer, remeasure]);

  // Any change to which panes exist or whether the Shell is raised must reach
  // the main process in the same frame the DOM settles.
  useLayoutEffect(() => {
    remeasure();
  }, [order, shellOnTop, remeasure]);

  const value = useMemo<LayoutRegistry>(
    () => ({ register, remeasure }),
    [register, remeasure],
  );

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}

/**
 * A hole in the Shell's layout where a page view is composited. It paints
 * nothing -- the native WebContentsView covers exactly this rectangle.
 */
export function ViewSlot({ tabId }: { tabId: string }): React.JSX.Element {
  const registry = useContext(LayoutContext);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    registry?.register(tabId, ref.current);
    return () => registry?.register(tabId, null);
  }, [registry, tabId]);

  return <div className="view-slot" ref={ref} data-tab-id={tabId} />;
}
