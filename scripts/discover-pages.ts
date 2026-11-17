/**
 * Step 6 helper: open the app with the saved session and list the internal links,
 * navigation links first, to choose which pages to add to tests/support/pages.ts.
 *
 *   npm run discover:pages                # starts at BASE_URL '/'
 *   npm run discover:pages -- /dashboard  # starts at another path (e.g. the post-login page)
 */
import 'dotenv/config';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

async function main() {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) throw new Error('BASE_URL missing in .env');
  if (!fs.existsSync('.auth/user.json')) throw new Error('.auth/user.json not found. Run: npm run test:auth');

  const start = process.argv[2] ?? '/';
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: '.auth/user.json', baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const apiCalls = new Set<string>();
  page.on('request', (r) => {
    if (['xhr', 'fetch'].includes(r.resourceType())) apiCalls.add(`${r.method()} ${new URL(r.url()).origin}${new URL(r.url()).pathname}`);
  });

  // Accepts a path ('/dashboard') or a full URL (e.g. the post-login subdomain).
  await page.goto(start, { waitUntil: 'load', timeout: 60_000 });
  // Apps that poll or stream never reach "networkidle"; give it a bounded chance, then continue.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  console.log(`Landed on: ${page.url()}\n`);

  const links = await page.$$eval('a[href]', (as) =>
    as.map((a) => ({
      text: ((a as HTMLElement).innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50),
      href: (a as HTMLAnchorElement).href,
      nav: !!a.closest('nav, aside, header, [role="navigation"]'),
    })),
  );

  const origin = new URL(page.url()).origin;
  const seen = new Map<string, { text: string; nav: boolean }>();
  for (const l of links) {
    const u = new URL(l.href);
    if (u.origin !== origin) continue;
    const prev = seen.get(u.pathname);
    if (!prev) seen.set(u.pathname, { text: l.text, nav: l.nav });
    else if (l.nav) prev.nav = true;
  }

  const rows = [...seen].sort((a, b) => Number(b[1].nav) - Number(a[1].nav) || a[0].localeCompare(b[0]));
  console.log('NAV  PATH                                     LINK TEXT');
  for (const [p, { text, nav }] of rows) console.log(`${nav ? ' * ' : '   '}  ${p.padEnd(40)} ${text}`);

  console.log(`\nAPI calls made by ${start}:`);
  for (const c of apiCalls) console.log(`   ${c}`);

  await browser.close();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
