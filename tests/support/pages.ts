/**
 * Single source of truth for which pages get visual tests.
 * Both scripts/record-fixtures.ts and tests/visual/pages.spec.ts read this list.
 *
 * Fill in after Step 6 (`npm run discover:pages`) once the page list is confirmed.
 */
export interface PageDef {
  /** kebab-case; used for screenshot names and fixture file names */
  name: string;
  /** route relative to BASE_URL, e.g. '/dashboard' */
  path: string;
  /** selectors that must be visible before the screenshot (chart containers, tables, …) */
  ready?: string[];
  /** selectors for content that stays dynamic even with mocked APIs */
  mask?: string[];
}

export const pages: PageDef[] = [
  // Found by clicking each sidebar item and each page's tabs on https://ym.elementsenergies.com (2026-11-12).
  // Tabs are addressable as ?tab=<id>; a page without ?tab shows its first tab, so only tab URLs are listed.
  // Naming: <page>-<tab>.

  // Facility Overview (no tabs)
  { name: 'facility', path: '/facility', ready: ['svg.recharts-surface'] },

  // Power Monitoring
  { name: 'power-monitoring-electrical', path: '/power-monitoring?tab=electrical', ready: ['svg.recharts-surface'] },
  { name: 'power-monitoring-harmonics', path: '/power-monitoring?tab=harmonics', ready: ['svg.recharts-surface'] },
  { name: 'power-monitoring-peak', path: '/power-monitoring?tab=peak', ready: ['svg.recharts-surface'] },
  { name: 'power-monitoring-diagrams', path: '/power-monitoring?tab=diagrams', ready: ['main svg'] },

  // Utilities
  { name: 'utilities-steam', path: '/utilities?tab=steam' },
  { name: 'utilities-dg', path: '/utilities?tab=dg' },

  // Zone/Equipment Analytics
  { name: 'zone-zone', path: '/zone?tab=zone', ready: ['.recharts-bar-rectangle path'] },
  { name: 'zone-equipment', path: '/zone?tab=equipment', ready: ['svg.recharts-surface'] },
  { name: 'zone-comparison', path: '/zone?tab=comparison' },
  { name: 'zone-production', path: '/zone?tab=production', ready: ['svg.recharts-surface'] },

  // Shift-wise (no tabs)
  { name: 'shift-wise', path: '/shift-wise', ready: ['svg.recharts-surface'] },

  // AI Predictions & Optimization
  { name: 'ai-overall', path: '/ai?tab=overall', ready: ['svg.recharts-surface'] },
  { name: 'ai-equipment', path: '/ai?tab=equipment', ready: ['svg.recharts-surface'] },
  { name: 'ai-zone', path: '/ai?tab=zone', ready: ['svg.recharts-surface'] },

  // Alerts & Notifications
  { name: 'alerts-active', path: '/alerts?tab=active', ready: ['main table'] },
  { name: 'alerts-history', path: '/alerts?tab=history', ready: ['main table'] },
  { name: 'alerts-settings', path: '/alerts?tab=settings' },

  // Reports (no tabs)
  { name: 'reports', path: '/reports', ready: ['main table'] },
];

/** Masked on every page (e.g. the logged-in user's name in the header). */
export const globalMask: string[] = [];

/**
 * The app scrolls inside this element, not the window, so `fullPage` alone only captures the viewport.
 * Tests expand it to its full height before the screenshot.
 */
export const scrollContainer = 'main.app-content';

/** The browser clock is frozen here in tests so "today", "last 7 days", relative times etc. are stable. */
// Fallback only: tests normally freeze at the time saved in tests/fixtures/<page>.clock.json.
export const FIXED_NOW = new Date('2026-01-15T10:00:00+05:30');
