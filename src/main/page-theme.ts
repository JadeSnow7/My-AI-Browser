import type { WebContents } from "electron";

/**
 * Where the top strip gets its colour.
 *
 * The strip sits directly against the page, so painting it a fixed dark grey
 * puts a hard seam across every light page. Tinting it to the page removes the
 * seam without pretending the strip is part of the document.
 *
 * Two sources, in order of trust:
 *
 * 1. `did-change-theme-color` -- Chromium's own reading of `<meta name=
 *    "theme-color">`. Free, already correct, and the page author's stated
 *    intent.
 * 2. A probe for the actual painted background, for the overwhelming majority
 *    of pages that set no theme colour.
 *
 * The probe runs in an **isolated world**. The page's main world can redefine
 * `getComputedStyle`, and while the worst case here is only a wrong colour, the
 * boundary is not worth crossing for a convenience.
 */

/** Isolated world reserved for the Shell's own probes. */
const SHELL_WORLD = 1000;

const PROBE = `(() => {
  const opaque = (value) =>
    value &&
    value !== "transparent" &&
    !/rgba\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*0\\s*\\)/.test(value);
  const of = (element) =>
    element ? getComputedStyle(element).backgroundColor : null;
  // body wins: html is usually transparent and inherits the canvas colour.
  const body = of(document.body);
  if (opaque(body)) return body;
  const root = of(document.documentElement);
  return opaque(root) ? root : null;
})()`;

export type ThemeListener = (color: string | null) => void;

/**
 * Watch one tab's background colour. Returns a disposer.
 *
 * A theme colour, once seen, outranks the probe: a page that declares one
 * means it, and re-probing on every in-page navigation would let a
 * scroll-triggered background flip the chrome around.
 */
export function watchPageTheme(
  wc: WebContents,
  onColor: ThemeListener,
): () => void {
  let declared: string | null = null;

  const themeChanged = (_event: unknown, color: string | null): void => {
    declared = color;
    onColor(color);
  };

  const probe = (): void => {
    if (declared) return;
    if (wc.isDestroyed()) return;
    void wc
      .executeJavaScriptInIsolatedWorld(SHELL_WORLD, [{ code: PROBE }])
      .then((color: unknown) => {
        if (!declared) onColor(typeof color === "string" ? color : null);
      })
      // A page that refuses to run the probe (about:blank, an error page, a
      // CSP that blocks nothing but happens to be mid-teardown) just keeps the
      // default chrome colour.
      .catch(() => onColor(null));
  };

  // A cross-document navigation invalidates both sources: the new document may
  // declare no theme colour where the old one did.
  const navigated = (): void => {
    declared = null;
    onColor(null);
  };

  wc.on("did-change-theme-color", themeChanged);
  wc.on("did-navigate", navigated);
  wc.on("did-finish-load", probe);

  return () => {
    if (wc.isDestroyed()) return;
    wc.removeListener("did-change-theme-color", themeChanged);
    wc.removeListener("did-navigate", navigated);
    wc.removeListener("did-finish-load", probe);
  };
}
