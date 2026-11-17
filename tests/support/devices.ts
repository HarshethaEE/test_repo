import { devices } from '@playwright/test';

/**
 * Screen sizes every page is tested at. Each one becomes a Playwright project, so baselines are
 * stored per size (facility-iphone-win32.png) and one size can be run with --project=iphone.
 *
 * Desktop sizes are common monitor resolutions. Touch sizes are real devices from Playwright's
 * device list: the viewport is the area the browser actually gets on that device (screen minus
 * status bar and browser toolbars), with the device's user agent, touch input and mobile viewport
 * handling. Only these real sizes are checked for responsiveness.
 */
export const desktopSizes = {
  wide: { width: 1920, height: 1080 },
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
} as const;

export const touchDevices = {
  ipad: devices['iPad (gen 7)'], // 810×1080, portrait
  android: devices['Pixel 7'], // 412×839
  iphone: devices['iPhone 15'], // 393×659
} as const;

/** The tablet the resize test shrinks the desktop window to. */
export const resizeTarget = { name: 'ipad', viewport: touchDevices.ipad.viewport } as const;
