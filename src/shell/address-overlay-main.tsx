import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AddressOverlayCloseReason, AddressOverlayEvent, AddressOverlayModel } from "../shared/address-overlay";
import { UniversalShell } from "./components/UniversalShell";
import "./styles.css";

declare global {
  interface Window {
    addressOverlay: {
      ready: () => void;
      subscribeModel: (fn: (model: AddressOverlayModel) => void) => () => void;
      event: (event: AddressOverlayEvent) => void;
    };
  }
}

type LocalEvent =
  | { type: "painted" | "enter" | "leave" | "edit" | "settled" }
  | { type: "resize"; height: number }
  | { type: "action"; action: "navigate" | "search" | "command" | "unwired"; payload: string }
  | { type: "dismiss"; reason: AddressOverlayCloseReason };

function Overlay(): React.JSX.Element {
  const [model, setModel] = useState<AddressOverlayModel | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const emitRef = useRef<((event: LocalEvent) => void) | null>(null);
  const lastSeed = useRef<{ sessionId: string; revision: number } | null>(null);

  useEffect(() => {
    const off = window.addressOverlay.subscribeModel((next) => {
      const previous = lastSeed.current;
      const fresh = !previous || previous.sessionId !== next.sessionId || previous.revision !== next.seedRevision;
      setModel(next);
      // Preview follows page navigation; an edit draft is intentionally
      // protected from address updates until the user submits it.
      if (fresh && (next.mode === "preview" || previous?.sessionId !== next.sessionId))
        setQuery(next.querySeed);
      setSelected(0);
      lastSeed.current = { sessionId: next.sessionId, revision: next.seedRevision };
    });
    window.addressOverlay.ready();
    return off;
  }, []);

  // React may commit an IPC-driven state update after the animation frame in
  // which the subscription callback ran. A post-commit handshake prevents the
  // main process from exposing a native view before it has actually painted.
  useEffect(() => {
    if (!model) return;
    // The native view is intentionally hidden until this handshake. A hidden
    // WebContentsView may throttle requestAnimationFrame, so use a macrotask
    // instead of waiting on a frame that can never be produced.
    const timer = setTimeout(() => emitRef.current?.({ type: "painted" }), 0);
    return () => clearTimeout(timer);
  }, [model?.sessionId, model?.seedRevision]);

  useLayoutEffect(() => {
    if (!model || model.mode === "preview" || !root.current) return;
    const shell = root.current.querySelector<HTMLElement>(".ushell");
    if (!shell) return;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(shell.getBoundingClientRect().height);
      emitRef.current?.({ type: "resize", height });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, [model]);

  if (!model) return <div className="address-overlay-root" ref={root} />;

  const emit = (event: LocalEvent): void => {
    window.addressOverlay.event({ ...event, sessionId: model.sessionId } as AddressOverlayEvent);
  };
  emitRef.current = emit;

  const commands = model.context.commands.map((command) => ({
    name: command.name,
    hint: command.hint,
    run: () => emit({ type: "action", action: "command", payload: command.id }),
  }));

  return (
    <div
      ref={root}
      className={`address-overlay-root overlay-${model.mode}${model.reducedMotion ? " reduced-motion" : ""}`}
      onMouseEnter={() => emit({ type: "enter" })}
      onMouseLeave={() => emit({ type: "leave" })}
      onAnimationEnd={(event) => {
        if (event.animationName === "overlay-address-drop") emit({ type: "settled" });
      }}
    >
      <UniversalShell
        query={query}
        onQuery={setQuery}
        selected={selected}
        onSelected={setSelected}
        onClose={() => emit({ type: "dismiss", reason: "escape" })}
        onEdit={() => emit({ type: "edit" })}
        focusOnMount={model.mode !== "preview"}
        preview={model.mode === "preview"}
        context={{
          activeUrl: model.context.activeUrl,
          tabCount: model.context.tabCount,
          taskName: model.context.taskName,
          navigate: (url) => emit({ type: "action", action: "navigate", payload: url }),
          search: (terms) => emit({ type: "action", action: "search", payload: terms }),
          unwired: (what) => emit({ type: "action", action: "unwired", payload: what }),
          commands,
        }}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Overlay />);
