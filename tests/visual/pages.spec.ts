import { test, expect } from '@playwright/test';
import { pages } from '../support/pages';
import { expandScrollContainer, masksFor, openPage } from '../support/visual';

// Screenshot comparison: one test per entry in tests/support/pages.ts, run at every screen size
// (each size is a project in playwright.config.ts, so baselines are stored per size).
for (const def of pages) {
  test(`screenshot: ${def.name} (${def.path})`, async ({ page }) => {
    await openPage(page, def);
    // keepWidth: grow downward only, so phones and tablets are captured at their real width.
    await expandScrollContainer(page, { keepWidth: true });
    await expect(page).toHaveScreenshot(`${def.name}.png`, { fullPage: true, mask: masksFor(page, def) });
  });
}
