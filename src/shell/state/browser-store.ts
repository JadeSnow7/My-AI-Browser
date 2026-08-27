import type { PlatformInfo } from "../../shared/types";

/**
 * Top-chrome metrics. Rail and panel sizing live in `panels.ts`, because they
 * participate in the space-pressure policy and this does not.
 */
export const EXPANDED_TOP = 48;

/**
 * Collapsed top strip. macOS needs enough room to clear the native traffic
 * lights that `titleBarStyle: 'hiddenInset'` draws over the content; elsewhere
 * a sliver is enough to give the frameless window something to drag by.
 */
export const collapsedTop = (platform: PlatformInfo): number =>
  platform.nativeWindowControls ? 30 : 8;

export const topChromeHeight = (
  platform: PlatformInfo,
  addressOpen: boolean,
): number => (addressOpen ? EXPANDED_TOP : collapsedTop(platform));
