/**
 * Top-chrome metrics. Rail and panel sizing live in `panels.ts`, because they
 * participate in the space-pressure policy and this does not.
 */

/**
 * The top strip, on every platform.
 *
 * macOS needs this much to clear the native traffic lights that
 * `titleBarStyle: 'hiddenInset'` draws over the content. Elsewhere the window
 * is genuinely frameless and the Shell draws its own buttons -- which need the
 * same room, so the old 8px sliver left them overflowing into the page area,
 * where the page view covered them and made them unclickable.
 *
 * It is also the strip that now carries the address label, so a sliver would
 * not do regardless of who draws the window buttons.
 */
export const TOP_STRIP = 30;

export const topChromeHeight = (): number => TOP_STRIP;
