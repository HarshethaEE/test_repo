import 'dotenv/config';
import { defineConfig, devices, type Project } from '@playwright/test';

import { desktopSizes, touchDevices } from './tests/support/devices';

/** Settings shared by every size project. */
const common = {
  // Keep 1:1 pixels at every size so screenshots stay small and comparable (real phones are 2-3x;
  // layout in CSS pixels is the same).
  deviceScaleFactor: 1,
  storageState: '.auth/user.json',
  // The site has a theme toggle; pin the scheme so baselines don't flip.
  colorScheme: 'light',
  // Service workers can bypass page.route(), so block them to keep API mocking reliable.
  serviceWorkers: 'block',
} as const;

const sizeProjects: Project[] = [
  ...Object.entries(desktopSizes).map(([name, viewport]) => ({
    name,
    testMatch: /.*\.spec\.ts/,
    dependencies: ['setup'],
    use: { ...devices['Desktop Chrome'], viewport, ...common },
  })),
  // Real devices (see tests/support/devices.ts). All run in Chromium, including the Apple ones:
  // size, touch, user agent and mobile viewport match the device; Safari-only CSS quirks aren't covered.
  ...Object.entries(touchDevices).map(([name, device]) => ({
    name,
    testMatch: /.*\.spec\.ts/,
    dependencies: ['setup'],
    use: { ...device, defaultBrowserType: 'chromium' as const, ...common },
  })),
];

export default defineConfig({
  testDir: './tests',
  retries: 0,
  // Pages load their code from the live site; 30s (the default) was occasionally too short.
  timeout: 90_000,
  // Tall full-page screenshots (Facility ~4400px) are CPU-heavy; more parallel browsers made
  // them slow enough to time out. Override with --workers if your machine has headroom.
  workers: 2,
  reporter: [
    // Full report: every test, screenshot diffs, and layout-issues.png / .txt on layout tests.
    ['html'],
    // Overview grid of the layout:/resize: tests (pages × sizes) with outlined screenshots.
    ['./tests/support/responsive-reporter.ts', { outputFolder: 'responsive-report' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL,
    viewport: desktopSizes.desktop,
    // A trace of every failed test (DOM snapshots, network, console), viewable from the HTML report.
    trace: 'retain-on-failure',
  },
  expect: {
    // Capturing + comparing tall pages can exceed the 5s default when several workers run at once.
    timeout: 45_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    ...sizeProjects,
  ],
});
