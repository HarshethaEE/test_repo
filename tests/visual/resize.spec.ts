import { test, expect, type Page } from '@playwright/test';
import { pages } from '../support/pages';
import { openPage, waitForChartsStable } from '../support/visual';
import { resizeTarget } from '../support/devices';
import { attachLayoutReport, clippedCards, describeIssues, numberIssues, offscreenElements, type LayoutIssue } from '../support/layout';

/**
 * Resize behaviour: open each page at desktop size, shrink the window to tablet size, and check
 * that nothing ends up cut off that wouldn't be cut off when the page is opened at tablet size
 * directly. Catches components that measure their size only once (charts, heat map) and don't
 * adapt when a user resizes the window or rotates a tablet. Runs in the desktop project only.
 */
// The real tablet size (iPad gen 7, 810×1080) from tests/support/devices.ts.
const TABLET = resizeTarget.viewport;

async function settle(page: Page) {
  await page.waitForTimeout(1_000); // resize observers / debounced handlers
  await waitForChartsStable(page);
}

for (const def of pages) {
  test(`resize: ${def.name} desktop -> ${resizeTarget.name} (${TABLET.width}px)`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'runs once, in the desktop project');

    // Reference: opened directly at tablet size (its own problems are covered by layout.spec).
    await page.setViewportSize(TABLET);
    await openPage(page, def);
    const atTablet = [...(await offscreenElements(page, 50)), ...(await clippedCards(page))];

    // Opened at desktop size (fresh tab, so the clock/animation patches are installed once), then shrunk.
    const desktop = await page.context().newPage();
    await desktop.setViewportSize({ width: 1440, height: 900 });
    await openPage(desktop, def);
    await desktop.setViewportSize(TABLET);
    await settle(desktop);
    const afterResize = [...(await offscreenElements(desktop, 50)), ...(await clippedCards(desktop))];

    const known = new Set(atTablet.map((i: LayoutIssue) => i.element));
    const onlyAfterResize = afterResize.filter((i) => !known.has(i.element));

    // Outlines are drawn on the resized page, which is where the problem shows.
    const issues = numberIssues([['resize', onlyAfterResize]]);
    await attachLayoutReport(desktop, testInfo, issues);
    expect(onlyAfterResize.length, describeIssues('resize', issues)).toBe(0);
  });
}
