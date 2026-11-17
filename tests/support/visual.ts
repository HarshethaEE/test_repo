import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { FIXED_NOW, globalMask, scrollContainer, type PageDef } from './pages';
import { FIXTURE_DIR, exactKey, loadManifest, loadRecordedNow, looseKey, type ManifestEntry } from './fixtures';

/**
 * Freeze Date.now() so date-dependent UI renders identically every run. Call before goto.
 * Uses the instant the page's fixtures were recorded at (falls back to FIXED_NOW).
 */
export async function freezeTime(page: Page, pageName: string) {
  await page.clock.setFixedTime(loadRecordedNow(pageName) ?? FIXED_NOW);
  await skipJsAnimations(page);
  await hideScrollbars(page);
}

/**
 * Hide scrollbars from the first paint. Otherwise the content width changes when the inner scroll
 * area's scrollbar appears/disappears, and components that measure their width only once (the
 * Facility heat map) end up with a different width depending on timing.
 */
async function hideScrollbars(page: Page) {
  await page.addInitScript(() => {
    const css = '*{scrollbar-width:none !important}*::-webkit-scrollbar{display:none !important}';
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.documentElement.appendChild(s);
    };
    if (document.documentElement) add();
    else document.addEventListener('DOMContentLoaded', add);
  });
}

/**
 * Recharts animates bars/arcs from requestAnimationFrame timestamps, which CSS `animations: 'disabled'`
 * can't stop, and every resize (including the one a fullPage screenshot does) replays them.
 * Hand each frame a timestamp 10s after the previous one, so any rAF-driven animation reaches
 * its end state on the next frame and charts always render fully drawn.
 */
async function skipJsAnimations(page: Page) {
  await page.addInitScript(() => {
    // One shared fake timeline for performance.now() and rAF timestamps: every frame moves it
    // forward 10s. Charts may measure start/progress with either, so both must agree.
    const realRaf = window.requestAnimationFrame.bind(window);
    const realNow = performance.now.bind(performance);
    let offset = 0;
    performance.now = () => realNow() + offset;
    window.requestAnimationFrame = (cb: FrameRequestCallback) =>
      realRaf(() => {
        offset += 10_000;
        cb(performance.now());
      });
  });
}

/**
 * Serve every XHR/fetch from the recorded fixtures for this page.
 * Exact match (URL + query + body) first, then a match on path only.
 * Unmatched API calls are aborted by default so live data can't leak into screenshots;
 * they're returned so the test can report them.
 */
export async function mockApis(page: Page, pageName: string, { strict = true } = {}) {
  const manifest = loadManifest(pageName);
  if (!manifest) throw new Error(`No fixtures for "${pageName}". Run: npm run record:fixtures -- ${pageName}`);

  const exact = new Map(Object.entries(manifest));
  const loose = new Map<string, ManifestEntry>();
  for (const e of Object.values(manifest)) {
    const k = looseKey(e.method, e.url);
    if (!loose.has(k)) loose.set(k, e);
  }

  const unmatched: string[] = [];
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (!['xhr', 'fetch'].includes(req.resourceType())) return route.fallback();

    const entry = exact.get(exactKey(req.method(), req.url(), req.postData())) ?? loose.get(looseKey(req.method(), req.url()));
    if (entry) {
      return route.fulfill({
        status: entry.status,
        contentType: entry.contentType,
        body: fs.readFileSync(path.join(FIXTURE_DIR, entry.file)),
      });
    }
    unmatched.push(`${req.method()} ${req.url()}`);
    return strict ? route.abort() : route.fallback();
  });
  return unmatched;
}

/** Wait until the page has settled: network idle, web fonts loaded, page-specific elements visible. */
export async function waitForReady(page: Page, def: PageDef) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  for (const sel of def.ready ?? []) {
    await expect(page.locator(sel).first(), `waiting for "${sel}"`).toBeVisible({ timeout: 30_000 });
  }
}

/**
 * Let the inner scroll container (and every ancestor) grow to its content height, then make the
 * viewport that tall, so the fullPage screenshot includes everything below the fold.
 *
 * The viewport must already be full height before the screenshot: otherwise the fullPage capture
 * resizes it, Recharts redraws and restarts its bar animation from zero, and on a busy machine
 * (parallel workers) the capture lands before the bars are drawn.
 */
export async function expandScrollContainer(page: Page, { keepWidth = false } = {}) {
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  await page.evaluate(
    ({ sel, minHeight, keepWidth }) => {
      let el = document.querySelector<HTMLElement>(sel);
      while (el) {
        if (keepWidth) {
          // Grow downward only; content wider than the window stays clipped as the user sees it
          // (overflow-x: clip, unlike hidden, doesn't turn overflow-y: visible into auto).
          el.style.setProperty('overflow-x', 'clip', 'important');
          el.style.setProperty('overflow-y', 'visible', 'important');
        } else el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', 'none', 'important');
        // Fixed px (not 100vh) so short pages keep a full-height sidebar without growing
        // again when the viewport is resized below.
        el.style.setProperty('min-height', `${minHeight}px`, 'important');
        el = el.parentElement;
      }
    },
    { sel: scrollContainer, minHeight: viewport.height, keepWidth },
  );
  // Lock every element in the content area at its current height first: some parts are sized in
  // viewport units (the 3D model card) and would otherwise grow with the taller viewport, and
  // charts would see a resize and redraw.
  await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return;
    // Read everything first, then write: reading layout/style after a write forces a full style
    // recalculation per element, which is very slow on big pages (Facility has thousands of elements).
    const els = Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
      (el) => el instanceof HTMLElement && getComputedStyle(el).display !== 'inline',
    );
    const heights = els.map((el) => el.getBoundingClientRect().height);
    els.forEach((el, i) => {
      el.style.setProperty('box-sizing', 'border-box', 'important');
      for (const prop of ['height', 'min-height', 'max-height']) el.style.setProperty(prop, `${heights[i]}px`, 'important');
    });
  }, scrollContainer);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (height > viewport.height) await page.setViewportSize({ width: viewport.width, height });
  await waitForChartsStable(page);
}

/**
 * Recharts animates bars/arcs with JS (not CSS), so `animations: 'disabled'` doesn't stop it,
 * and resizing the container replays the animation. Poll the chart SVG markup until it has
 * stopped changing for several consecutive checks.
 */
export async function waitForChartsStable(page: Page, { interval = 250, stableChecks = 4, timeout = 15_000 } = {}) {
  const snapshot = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('svg.recharts-surface, canvas'))
        .map((el) => (el instanceof HTMLCanvasElement ? `${el.width}x${el.height}` : el.innerHTML))
        .join('|'),
    );
  const deadline = Date.now() + timeout;
  let prev = await snapshot();
  let same = 0;
  while (same < stableChecks && Date.now() < deadline) {
    await page.waitForTimeout(interval);
    const next = await snapshot();
    same = next === prev ? same + 1 : 0;
    prev = next;
  }
}

/**
 * Open a page the same way in every spec: frozen clock, mocked APIs, wait until drawn.
 * Records unmocked API calls as a test annotation.
 */
export async function openPage(page: Page, def: PageDef) {
  await freezeTime(page, def.name);
  const unmatched = await mockApis(page, def.name);
  // Page code/assets still come from the live server (only API calls are mocked), so allow for a
  // slow network. 'domcontentloaded' avoids waiting on every image; waitForReady does the real waiting.
  await page.goto(def.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page, 'Redirected to login: session not valid, re-run npm run test:auth').not.toHaveURL(/\/login/);
  await waitForReady(page, def);
  await waitForChartsStable(page);
  const relevant = unmatched.filter((u) => !/\.glb$|\/cdn-cgi\//.test(u)); // 3D model file, Cloudflare analytics
  if (relevant.length) test.info().annotations.push({ type: 'unmocked API calls (aborted)', description: relevant.join('\n') });
}

export function masksFor(page: Page, def: PageDef): Locator[] {
  return [...globalMask, ...(def.mask ?? [])].map((s) => page.locator(s));
}
