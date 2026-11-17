/**
 * Record the JSON API responses each page makes, using the logged-in session.
 *
 *   npm run record:fixtures              # all pages in tests/support/pages.ts
 *   npm run record:fixtures -- dashboard # only the named page(s)
 *
 * Writes tests/fixtures/<page>-<endpoint>.json plus tests/fixtures/<page>.manifest.json
 * (request -> fixture file), which tests/support/visual.ts uses to mock the APIs.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Response } from '@playwright/test';
import { pages } from '../tests/support/pages';
import { FIXTURE_DIR, exactKey, loadManifest, manifestPath, saveRecordedNow, type Manifest } from '../tests/support/fixtures';
import { sanitize, sanitizeUrl } from './sanitize';

const AUTH_FILE = '.auth/user.json';

function fixtureName(pageName: string, method: string, url: string, used: Set<string>): string {
  const slug =
    new URL(url).pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 80) || 'root';
  const base = `${pageName}-${method === 'GET' ? '' : method.toLowerCase() + '-'}${slug}`;
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}-${i}`;
  used.add(name);
  return `${name}.json`;
}

async function main() {
  const baseURL = process.env.BASE_URL;
  if (!baseURL) throw new Error('BASE_URL missing in .env');
  if (!fs.existsSync(AUTH_FILE)) throw new Error(`${AUTH_FILE} not found. Run: npm run test:auth`);

  const only = process.argv.slice(2);
  const targets = pages.filter((p) => !only.length || only.includes(p.name));
  if (!targets.length) {
    throw new Error(only.length ? `No pages named: ${only.join(', ')}` : 'tests/support/pages.ts has no pages yet');
  }

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    baseURL,
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });

  for (const def of targets) {
    // Remove this page's previous recording so stale endpoints don't linger.
    const old = loadManifest(def.name);
    for (const e of Object.values(old ?? {})) fs.rmSync(path.join(FIXTURE_DIR, e.file), { force: true });

    const page = await context.newPage();
    // Freeze at the real current minute and save it; tests freeze at the same instant, so the app
    // requests the same date ranges (?start=…&end=…) when replaying as when recording.
    const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
    await page.clock.setFixedTime(now);
    saveRecordedNow(def.name, now);
    const manifest: Manifest = {};
    const used = new Set<string>();
    const pending: Promise<void>[] = [];

    const capture = async (res: Response) => {
      const req = res.request();
      if (!['xhr', 'fetch'].includes(req.resourceType()) || !res.ok()) return;
      const contentType = res.headers()['content-type'] ?? '';
      if (!contentType.includes('json')) return;

      const key = exactKey(req.method(), sanitizeUrl(req.url()), req.postData());
      if (manifest[key]) return; // first response wins (polling endpoints)
      const body = await res.json();
      const file = fixtureName(def.name, req.method(), req.url(), used);
      fs.writeFileSync(path.join(FIXTURE_DIR, file), JSON.stringify(sanitize(body), null, 2) + '\n');
      manifest[key] = { method: req.method(), url: sanitizeUrl(req.url()), status: res.status(), contentType, file };
    };
    page.on('response', (res) => pending.push(capture(res).catch((e) => console.warn(`  ! ${res.url()}: ${e.message}`))));

    await page.goto(def.path, { waitUntil: 'load', timeout: 60_000 });
    // Apps that poll never reach "networkidle"; the ready selectors + delay below do the real waiting.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    if (/\/login/.test(new URL(page.url()).pathname)) {
      throw new Error(`Redirected to login while opening ${def.path}. Session expired: run npm run test:auth`);
    }
    for (const sel of def.ready ?? []) await page.locator(sel).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_500); // catch late / lazy requests
    await Promise.all(pending);

    fs.writeFileSync(manifestPath(def.name), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`${def.name} (${def.path}): ${Object.keys(manifest).length} endpoint(s)`);
    for (const e of Object.values(manifest)) console.log(`   ${e.method} ${e.url} -> ${e.file}`);
    await page.close();
  }

  await browser.close();
  console.log('\nReview tests/fixtures for personal/sensitive data before committing.');
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
