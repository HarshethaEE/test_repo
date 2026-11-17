# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual\layout.spec.ts >> layout: ai-overall (/ai?tab=overall)
- Location: tests\visual\layout.spec.ts:26:3

# Error details

```
Error: Tap target smaller than 24×24px (WCAG 2.5.8):
  #1 input "Search page…": 70x18px
  #2 span "Dismiss greeting": 20x20px
  How to fix: Increase padding, or set min-width / min-height: 24px (44px recommended) on the button or link. The icon can stay small; the clickable area should grow.
  (see the "layout-issues.png" attachment: the numbers match)

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 2
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - button "Open menu" [ref=e4] [cursor=pointer]
      - complementary [ref=e6]:
        - button "Close menu" [ref=e7] [cursor=pointer]
        - generic [ref=e13]:
          - generic [ref=e14]: Elements Energy
          - generic [ref=e15]: Elements Intelligence
        - navigation [ref=e16]:
          - button "Facility Overview" [ref=e17] [cursor=pointer]
          - button "Power Monitoring" [ref=e25] [cursor=pointer]
          - button "Utilities" [ref=e30] [cursor=pointer]
          - button "Zone/Equipment Analytics" [ref=e36] [cursor=pointer]
          - button "Shift-wise" [ref=e41] [cursor=pointer]
          - button "AI Predictions & Optimization" [ref=e47] [cursor=pointer]
          - button "Alerts & Notifications 6" [ref=e52] [cursor=pointer]:
            - generic [ref=e57]: Alerts & Notifications
            - generic [ref=e58]: "6"
          - button "Reports" [ref=e59] [cursor=pointer]
      - generic [ref=e65]:
        - banner [ref=e66]:
          - generic: AI Predictions & Optimization
          - generic [ref=e67]:
            - textbox "Search page…" [ref=e72]
            - generic [ref=e73]:
              - button "Previous day" [ref=e74] [cursor=pointer]
              - button "12 Nov 2026" [ref=e78] [cursor=pointer]
              - button "Next day" [ref=e81] [cursor=pointer]
            - button "6" [ref=e85] [cursor=pointer]
            - button "YM" [ref=e91] [cursor=pointer]
        - main [ref=e93]:
          - generic [ref=e94]:
            - generic [ref=e95]:
              - button "Overall Consumption" [ref=e96] [cursor=pointer]
              - button "Equipment-wise" [ref=e97] [cursor=pointer]
              - button "Zone-wise" [ref=e98] [cursor=pointer]
            - generic [ref=e99]:
              - generic [ref=e100]:
                - generic [ref=e101]:
                  - paragraph [ref=e107]: Actual observed
                  - paragraph [ref=e108]: 11,941.9 kWh
                - generic [ref=e109]:
                  - paragraph [ref=e113]: Total predicted consumption
                  - paragraph [ref=e114]: 17,826.1 kWh
                - generic [ref=e115]:
                  - paragraph [ref=e121]: Prediction accuracy
                  - paragraph [ref=e122]: 96.1%
              - generic [ref=e123]:
                - paragraph [ref=e128]: Predicted Consumption
                - generic [ref=e131]:
                  - img [ref=e132]:
                    - generic [ref=e137]:
                      - generic [ref=e138]: 00:00
                      - generic [ref=e140]: 03:00
                      - generic [ref=e142]: 06:00
                      - generic [ref=e144]: 09:00
                      - generic [ref=e146]: 12:00
                      - generic [ref=e148]: 15:00
                      - generic [ref=e150]: 18:00
                      - generic [ref=e152]: 21:00
                    - generic [ref=e154]:
                      - generic [ref=e155]:
                        - generic [ref=e156]: "0"
                        - generic [ref=e158]: "350"
                        - generic [ref=e160]: "700"
                        - generic [ref=e162]: "1050"
                        - generic [ref=e164]: "1400"
                      - generic [ref=e166]: kWh
                  - list [ref=e180]:
                    - listitem [ref=e181]: Actual
                    - listitem [ref=e184]: Predicted
    - status [ref=e187]:
      - button "Open Energy Analytics Assistant" [ref=e188] [cursor=pointer]:
        - generic [ref=e189]:
          - generic [ref=e190]: Hi, I'm your Energy Analytics Assistant
          - generic [ref=e191]: Tap me when you want to analyze something.
        - button "Dismiss greeting" [ref=e192]
    - button "Open assistant" [ref=e197] [cursor=pointer]
  - generic [aria-hidden] [ref=e200]: "0"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { pages } from '../support/pages';
  3  | import { openPage } from '../support/visual';
  4  | import {
  5  |   attachLayoutReport,
  6  |   checks,
  7  |   clippedCards,
  8  |   describeIssues,
  9  |   formatIssues,
  10 |   headerOverlaps,
  11 |   horizontalOverflow,
  12 |   numberIssues,
  13 |   offscreenElements,
  14 |   smallTapTargets,
  15 |   type IssueKind,
  16 |   type LayoutIssue,
  17 | } from '../support/layout';
  18 | 
  19 | /**
  20 |  * Responsive layout checks, run at every screen size. Soft assertions report every problem on a page.
  21 |  * Each test attaches a screenshot with the offending elements outlined and numbered
  22 |  * (layout-issues.png), plus a numbered list with how to fix them (layout-issues.txt). Both show
  23 |  * in the Playwright HTML report, and the overview grid is in responsive-report/index.html.
  24 |  */
  25 | for (const def of pages) {
  26 |   test(`layout: ${def.name} (${def.path})`, async ({ page }, testInfo) => {
  27 |     await openPage(page, def);
  28 | 
  29 |     const found: [IssueKind, LayoutIssue[]][] = [
  30 |       ['overflow', await horizontalOverflow(page)],
  31 |       ['offscreen', await offscreenElements(page)],
  32 |       ['clipped', await clippedCards(page)],
  33 |       ['overlap', await headerOverlaps(page)],
  34 |     ];
  35 |     if (testInfo.project.use.hasTouch) {
  36 |       const { tooSmall, belowRecommended } = await smallTapTargets(page);
  37 |       found.push(['tap-too-small', tooSmall], ['tap-small', belowRecommended]);
  38 |       if (belowRecommended.length)
  39 |         testInfo.annotations.push({ type: 'tap targets below recommended 44x44px', description: formatIssues(belowRecommended) });
  40 |     }
  41 | 
  42 |     const issues = numberIssues(found);
  43 |     await attachLayoutReport(page, testInfo, issues);
  44 | 
  45 |     for (const [kind, list] of found)
> 46 |       if (checks[kind].severity === 'error') expect.soft(list.length, describeIssues(kind, issues)).toBe(0);
     |                                                                                                     ^ Error: Tap target smaller than 24×24px (WCAG 2.5.8):
  47 |   });
  48 | }
  49 | 
  50 | /** Phones: the sidebar must collapse behind a menu button that opens and closes it. */
  51 | test('layout: mobile navigation menu', async ({ page }, testInfo) => {
  52 |   test.skip(!testInfo.project.use.isMobile || (testInfo.project.use.viewport?.width ?? 1440) >= 768, 'only on phones');
  53 |   await openPage(page, pages.find((p) => p.name === 'facility')!);
  54 | 
  55 |   const sidebar = page.locator('aside').first();
  56 |   const inView = async () => {
  57 |     const box = await sidebar.boundingBox();
  58 |     return !!box && box.x + box.width > 1 && box.x < (page.viewportSize()?.width ?? 0);
  59 |   };
  60 | 
  61 |   expect(await inView(), 'sidebar should be hidden on phones').toBe(false);
  62 |   const open = page.getByRole('button', { name: /open menu/i });
  63 |   await expect(open, 'a menu button should be visible').toBeVisible();
  64 | 
  65 |   await open.click();
  66 |   await expect.poll(inView, { message: 'menu button should open the sidebar' }).toBe(true);
  67 |   await expect(sidebar.getByText('Power Monitoring')).toBeVisible();
  68 | 
  69 |   await page.getByRole('button', { name: /close menu/i }).click();
  70 |   await expect.poll(inView, { message: 'close button should hide the sidebar again' }).toBe(false);
  71 | });
  72 | 
```