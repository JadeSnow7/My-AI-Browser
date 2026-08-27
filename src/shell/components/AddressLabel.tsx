import React from "react";

/**
 * Where you are. Read-only.
 *
 * The top strip used to have no job: with no agent running, nothing to approve
 * and no console errors, the presence rule ("an idle surface shows nothing")
 * left 30px of empty chrome. Meanwhile "where am I" is a constant question
 * that could only be answered by opening a modal overlay.
 *
 * A label answers it for free. It is deliberately **not** an input: the whole
 * point of the Universal Shell is that there is one box, and a second
 * permanent field would put back the "which box did I want" decision that
 * merging the address bar and the palette removed. Clicking here opens that
 * one box, prefilled -- and because the overlay sits directly beneath the
 * strip, it reads as this label expanding downward into an editor.
 *
 * The origin is emphasised and the rest dimmed. That split is a security
 * boundary, not decoration: a path is page-controlled text and must never be
 * able to impersonate a host.
 */
export function AddressLabel({
  url,
  onOpen,
}: {
  url: string;
  onOpen: () => void;
}): React.JSX.Element | null {
  if (!url) return null;

  let host = "";
  let rest = "";
  try {
    const parsed = new URL(url);
    host = parsed.host;
    rest = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
  } catch {
    // Not a parseable URL (about:blank, a file path). Show it plainly rather
    // than guessing which part is the authority.
    host = url;
  }

  return (
    <button
      className="address"
      title={url}
      onClick={onOpen}
      aria-label={`Current address ${url}. Opens the Universal Shell.`}
    >
      <span className="address-host">{host}</span>
      {rest && <span className="address-rest">{rest}</span>}
    </button>
  );
}
