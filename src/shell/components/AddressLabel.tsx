import React from "react";

/** Read-only page identity. Editing belongs exclusively to the native overlay. */
export function AddressLabel({ url, onOpen, onPreview }: { url: string; onOpen: () => void; onPreview?: (url: string | null) => void; }): React.JSX.Element | null {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!url) return null;
  let host = url; let rest = "";
  try { const parsed = new URL(url); host = parsed.host; rest = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/$/, ""); } catch { /* display opaque page text as-is */ }
  const enter = (): void => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => onPreview?.(url), 120); };
  // The parent owns the joint label/overlay grace period. Calling immediately
  // here lets it cancel the close when the pointer enters the native surface.
  const leave = (): void => { if (timer.current) clearTimeout(timer.current); onPreview?.(null); };
  const open = (): void => { if (timer.current) clearTimeout(timer.current); onOpen(); };
  return <div className="address-wrap" onMouseEnter={enter} onMouseLeave={leave}>
    <button className="address" title={url} onClick={open} aria-label={`Current address ${url}. Opens the Universal Shell.`}>
      <span className="address-host">{host}</span>{rest && <span className="address-rest">{rest}</span>}
    </button>
  </div>;
}
