import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Paths are relative to the project root (where npm scripts run). */
export const FIXTURE_DIR = path.resolve('tests/fixtures');

export interface ManifestEntry {
  method: string;
  url: string;
  status: number;
  contentType: string;
  file: string;
}
/** Keyed by exactKey(). One manifest per page: tests/fixtures/<page>.manifest.json */
export type Manifest = Record<string, ManifestEntry>;

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

/** method + full URL (incl. query) + hash of the request body, if any */
export function exactKey(method: string, url: string, postData?: string | null): string {
  const u = new URL(url);
  return `${method} ${u.origin}${u.pathname}${u.search}${postData ? '#' + hash(postData) : ''}`;
}

/** Fallback match that ignores query string and body (e.g. date-range params). */
export function looseKey(method: string, url: string): string {
  const u = new URL(url);
  return `${method} ${u.origin}${u.pathname}`;
}

export const manifestPath = (pageName: string) => path.join(FIXTURE_DIR, `${pageName}.manifest.json`);

/**
 * The frozen "now" a page was recorded at: tests/fixtures/<page>.clock.json.
 * Tests freeze the browser at the same instant, so the app builds the same date-range
 * query strings and every request finds its exact fixture. (Recording uses the real time
 * because some endpoints, e.g. the hourly realtime trend, only return data for today.)
 */
export const clockPath = (pageName: string) => path.join(FIXTURE_DIR, `${pageName}.clock.json`);

export function saveRecordedNow(pageName: string, now: Date) {
  fs.writeFileSync(clockPath(pageName), JSON.stringify({ now: now.toISOString() }, null, 2) + '\n');
}

export function loadRecordedNow(pageName: string): Date | null {
  const p = clockPath(pageName);
  return fs.existsSync(p) ? new Date(JSON.parse(fs.readFileSync(p, 'utf8')).now) : null;
}

export function loadManifest(pageName: string): Manifest | null {
  const p = manifestPath(pageName);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest) : null;
}
