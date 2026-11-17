import { test, expect } from '@playwright/test';
import { pages } from '../support/pages';
import { openPage } from '../support/visual';
import {
  attachLayoutReport,
  checks,
  clippedCards,
  describeIssues,
  formatIssues,
  headerOverlaps,
  horizontalOverflow,
  numberIssues,
  offscreenElements,
  smallTapTargets,
  type IssueKind,
  type LayoutIssue,
} from '../support/layout';

/**
 * Responsive layout checks, run at every screen size. Soft assertions report every problem on a page.
 * Each test attaches a screenshot with the offending elements outlined and numbered
 * (layout-issues.png), plus a numbered list with how to fix them (layout-issues.txt). Both show
 * in the Playwright HTML report, and the overview grid is in responsive-report/index.html.
 */
for (const def of pages) {
  test(`layout: ${def.name} (${def.path})`, async ({ page }, testInfo) => {
    await openPage(page, def);

    const found: [IssueKind, LayoutIssue[]][] = [
      ['overflow', await horizontalOverflow(page)],
      ['offscreen', await offscreenElements(page)],
      ['clipped', await clippedCards(page)],
      ['overlap', await headerOverlaps(page)],
    ];
    if (testInfo.project.use.hasTouch) {
      const { tooSmall, belowRecommended } = await smallTapTargets(page);
      found.push(['tap-too-small', tooSmall], ['tap-small', belowRecommended]);
      if (belowRecommended.length)
        testInfo.annotations.push({ type: 'tap targets below recommended 44x44px', description: formatIssues(belowRecommended) });
    }

    const issues = numberIssues(found);
    await attachLayoutReport(page, testInfo, issues);

    for (const [kind, list] of found)
      if (checks[kind].severity === 'error') expect.soft(list.length, describeIssues(kind, issues)).toBe(0);
  });
}

/** Phones: the sidebar must collapse behind a menu button that opens and closes it. */
test('layout: mobile navigation menu', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile || (testInfo.project.use.viewport?.width ?? 1440) >= 768, 'only on phones');
  await openPage(page, pages.find((p) => p.name === 'facility')!);

  const sidebar = page.locator('aside').first();
  const inView = async () => {
    const box = await sidebar.boundingBox();
    return !!box && box.x + box.width > 1 && box.x < (page.viewportSize()?.width ?? 0);
  };

  expect(await inView(), 'sidebar should be hidden on phones').toBe(false);
  const open = page.getByRole('button', { name: /open menu/i });
  await expect(open, 'a menu button should be visible').toBeVisible();

  await open.click();
  await expect.poll(inView, { message: 'menu button should open the sidebar' }).toBe(true);
  await expect(sidebar.getByText('Power Monitoring')).toBeVisible();

  await page.getByRole('button', { name: /close menu/i }).click();
  await expect.poll(inView, { message: 'close button should hide the sidebar again' }).toBe(false);
});
