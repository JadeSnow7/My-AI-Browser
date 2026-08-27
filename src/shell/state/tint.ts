/**
 * Turning a page's background colour into a usable strip colour.
 *
 * Three things have to be true of the result, and none of them is "match the
 * page exactly":
 *
 * 1. **It must not shout.** A saturated brand colour across the top of every
 *    window is the page decorating the browser. Saturation is clamped, so a
 *    hot red page gives a muted one and the chrome stays chrome.
 * 2. **It must never reach pure black or white.** The design review of a light
 *    theme found the failure mode already: chrome and page at the same
 *    lightness leaves the page boundary as a 1px line. Clamping lightness
 *    keeps a step there.
 * 3. **It must say which foreground to use.** Text and pills on the strip have
 *    a light set and a dark set; picking the wrong one is unreadable, so the
 *    scheme travels with the colour rather than being guessed at the call site.
 *
 * Pure, so all of that is testable without a page.
 */

export type Scheme = "light" | "dark";

export interface Tint {
  /** CSS colour for the strip. */
  background: string;
  /** Which foreground token set the strip should use. */
  scheme: Scheme;
  /** True when the colour came from the page rather than the fallback. */
  tinted: boolean;
}

/** What the strip looks like with no page colour: the original chrome. */
export const DEFAULT_TINT: Tint = {
  background: "#13151b",
  scheme: "dark",
  tinted: false,
};

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB = /^rgba?\(([^)]+)\)$/i;

function parse(color: string): Rgb | null {
  const value = color.trim().toLowerCase();

  const hex = HEX.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4)
      digits = [...digits].map((d) => d + d).join("");
    if (digits.length !== 6 && digits.length !== 8) return null;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = RGB.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[,/]/).map((p) => Number(p.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n)))
      return null;
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1,
    };
  }

  return null;
}

/** WCAG relative luminance. Decides the foreground set, so it must be perceptual. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (raw: number): number => {
    const c = Math.min(1, Math.max(0, raw / 255));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / delta + 2) / 6
        : ((rn - gn) / delta + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const hex = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** A brand colour is allowed to tint the chrome, not to own it. */
const MAX_SATURATION = 0.22;
/** Never pure black or white: the page boundary has to survive. */
const MIN_LIGHTNESS = 0.06;
const MAX_LIGHTNESS = 0.96;
/** Below this relative luminance the strip needs light text. */
const LIGHT_TEXT_BELOW = 0.4;

export function tintFor(color: string | null | undefined): Tint {
  if (!color) return DEFAULT_TINT;
  const rgb = parse(color);
  // A transparent background tells us nothing about what the user sees.
  if (!rgb || rgb.a < 0.5) return DEFAULT_TINT;

  const { h, s, l } = toHsl(rgb);
  const background = hslToHex(
    h,
    Math.min(s, MAX_SATURATION),
    Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l)),
  );

  // Judge the scheme on the colour actually painted, not the source: clamping
  // lightness can move a near-black page above the threshold.
  const painted = parse(background);
  const scheme: Scheme =
    painted && luminance(painted) >= LIGHT_TEXT_BELOW ? "light" : "dark";

  return { background, scheme, tinted: true };
}
