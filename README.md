# ui-visual-tests

Visual regression tests for the Elements Energy web app, built with Playwright.
Each page is loaded with a logged-in session. Its API calls are served from recorded JSON fixtures and the clock is frozen
at the moment the fixtures were recorded (`tests/fixtures/<page>.clock.json`), so date-range requests match exactly.
Chart animations are skipped and the app's inner scroll area (`main.app-content`) is expanded, so the whole page is captured fully drawn.
A full-page screenshot is then compared against a committed baseline.

Every page runs at six screen sizes (each one a Playwright project, defined in `tests/support/devices.ts`).
Phone and tablet sizes are **real devices** from Playwright's device list: the viewport is the area the browser
actually gets on that device (screen minus status bar and browser toolbars), with its user agent and touch input.
All run in Chromium, so Safari-only CSS quirks are not covered.

| project | viewport | device |
|---|---|---|
| `wide` | 1920×1080 | large monitor |
| `desktop` | 1440×900 | |
| `laptop` | 1280×800 | |
| `ipad` | 810×1080 | iPad (gen 7), portrait, touch |
| `android` | 412×839 | Pixel 7, touch |
| `iphone` | 393×659 | iPhone 15, touch |

Three kinds of test:

- **`screenshot:`** compares each page with its baseline at each size (`facility-iphone-win32.png`, …).
- **`layout:`** responsive checks at each size. Failures list the offending elements:
  - the page scrolls sideways
  - an element is cut off at the window edge
  - content is wider than its card
  - items in the top bar overlap
  - tap targets are under 24×24px (touch sizes only; under 44×44px is noted as a warning)
  - on phones, the sidebar must collapse behind a menu button that opens and closes it
- **`resize:`** (desktop project only) opens each page at 1440px and shrinks the window to the iPad size (810px).
  It fails if something is cut off after the resize that isn't cut off when the page is opened at 810px directly,
  i.e. a component that doesn't adapt when the window is resized or a tablet is rotated.

## Seeing responsiveness problems

Every `layout:` and `resize:` test attaches three things to the Playwright HTML report (`npm run test:visual:report`, open the test):

- **layout-issues.png**: the whole page at that size, offending elements outlined and numbered
  (red = must fix, amber = recommended; a dashed blue line marks the window edge)
- **layout-issues.txt**: the numbered elements, what is wrong, and how to fix that kind of problem
- **layout-issues.json**: the same data, machine-readable

Failed tests also keep a **trace** (open it from the report) for inspecting the DOM and CSS at the moment of the check.

For an overview, every run that includes layout/resize tests also writes `responsive-report/index.html`: a grid of
pages × screen sizes, a "What to fix" list grouped by problem type, and each failing cell's list + outlined screenshot.

```bash
npm run test:layout          # run the layout + resize checks
npm run report:responsive    # open responsive-report/index.html
npm run test:visual:report   # or open the full Playwright report
```

The grid only covers the tests in the last run, so a single-page run gives a single-row report.
Runs with no layout/resize tests (e.g. `test:screenshots`) leave the previous grid alone.

## Layout

```
playwright.config.ts          projects: setup (login) -> wide/desktop/laptop/ipad/android/iphone
tests/auth.setup.ts           logs in with TEST_USER/TEST_PASS, saves .auth/user.json
tests/support/pages.ts        THE page list: name, path, ready selectors, masks
tests/support/visual.ts       API mocking, clock freeze, animation skip, wait-for-ready, masks
tests/support/layout.ts       responsive checks (overflow, cut-off, overlap, tap targets), fix hints, outlined screenshot
tests/support/responsive-reporter.ts  writes responsive-report/ (pages × sizes grid)
tests/support/fixtures.ts     fixture manifest format + request matching
tests/visual/pages.spec.ts    screenshot test per page (every size)
tests/visual/layout.spec.ts   layout checks per page (every size) + mobile menu test
tests/visual/resize.spec.ts   desktop -> iPad resize test per page
tests/support/devices.ts      the screen sizes / real devices
tests/visual/*-snapshots/     baselines (committed)
tests/fixtures/             recorded API responses + <page>.manifest.json (committed, after review)
scripts/discover-pages.ts   lists the app's links / API calls (to choose pages)
scripts/record-fixtures.ts  records each page's JSON API responses
scripts/sanitize.ts         scrubs emails, tokens, names, phones … from fixtures
scripts/open-responsive-report.mjs  opens responsive-report/index.html
```

## Setup

```bash
npm ci
npx playwright install chromium
cp .env.example .env        # then fill in TEST_USER and TEST_PASS
```

`.env`:

| var | meaning |
|---|---|
| `BASE_URL` | app root, e.g. `https://elementsenergies.com` |
| `TEST_USER` / `TEST_PASS` | a dedicated test account (password login, not passkey) |

`.env` and `.auth/` are git-ignored. Never commit them.

## Run order

```bash
npm run test:auth            # log in (headed) and save the session
npm run discover:pages       # list pages, if you're choosing new ones
npm run record:fixtures      # capture API data for every page in pages.ts
npm run test:visual:update   # create the first baselines (all sizes)
npm run test:visual          # everything: screenshots + layout + resize, all sizes
npm run test:visual:report   # open the HTML report (diffs shown side by side)
```

Narrower runs:

```bash
npm run test:screenshots     # screenshot comparisons only
npm run test:layout          # layout + resize checks only
npm run test:mobile          # everything, iPhone + Pixel only (test:tablet = iPad)
npx playwright test --project=desktop -g "facility"   # one page, one size
```

The suite runs 2 browsers in parallel (`workers` in `playwright.config.ts`). More made the tall full-page
screenshots slow enough to time out. A full run takes roughly 30–40 minutes.

`test:visual` runs the login setup first every time, so the session is always fresh.

## Updating baselines after an intentional UI change

1. Run `npm run test:visual` and check in the report that the only diffs are the intended ones.
2. Run `npm run test:visual:update`. To update a single page, use `npx playwright test -g "screenshot: dashboard" --update-snapshots`
   (add `--project=iphone` etc. for one size).
3. Commit the changed PNGs under `tests/visual/*-snapshots/` together with the UI change.

If the **data** shape changed (new API fields, new endpoints), re-record first with `npm run record:fixtures -- <page>`. Then review the fixture diff and update the baselines.

## Adding a new page test

1. Add an entry to `tests/support/pages.ts`:
   ```ts
   { name: 'reports', path: '/reports', ready: ['canvas'], mask: ['.last-updated'] }
   ```
   - Tabs inside a page have their own URL (`?tab=<id>`). Add one entry per tab, named `<page>-<tab>`,
     e.g. `{ name: 'utilities-dg', path: '/utilities?tab=dg' }`.
   - `ready` lists elements that must be visible before the shot (charts, tables).
   - `mask` covers anything still dynamic after mocking (clocks, "last updated", user name).
     Selectors masked on every page go in `globalMask`.
2. Record its data with `npm run record:fixtures -- reports`.
3. Review `tests/fixtures/reports-*.json` for personal or sensitive data. The sanitizer is best-effort, so extend `scripts/sanitize.ts` if needed.
4. Create its baseline with `npx playwright test -g "reports" --update-snapshots`.
5. Run `npm run test:visual` twice. If the second run differs, mask or stabilize that area.

If the report shows an **"unmocked API calls (aborted)"** annotation, the page made a request that wasn't recorded. Re-record that page.

## Docker (consistent rendering)

Font rendering differs between Windows, macOS and Linux. Playwright adds the platform to baseline file names
(`dashboard-desktop-win32.png` vs `dashboard-desktop-linux.png`), so each OS keeps its own baselines.
For CI, generate and check baselines inside Docker so everyone compares Linux to Linux.

```bash
docker build -t ui-visual-tests .

# bash / macOS / Linux
docker run --rm --env-file .env -v "$(pwd)":/work -v /work/node_modules -w /work ui-visual-tests npm run test:visual
# PowerShell
docker run --rm --env-file .env -v "${PWD}:/work" -v /work/node_modules -w /work ui-visual-tests npm run test:visual

# create / update Linux baselines: same command with npm run test:visual:update
```

The extra `-v /work/node_modules` keeps the container's Linux `node_modules` from being replaced by your host's copy.
Keep the image tag in `Dockerfile` equal to the installed `@playwright/test` version.
