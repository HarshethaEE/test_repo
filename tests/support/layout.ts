import type { Page, TestInfo } from '@playwright/test';
import { scrollContainer } from './pages';
import { expandScrollContainer } from './visual';

/** One problem found on the page, with a short CSS-ish path so it can be found in DevTools. */
export interface LayoutIssue {
  element: string;
  detail: string;
  /** data-layout-id values of the offending elements, used to outline them in the screenshot. */
  ids?: number[];
}

export type IssueKind = 'overflow' | 'offscreen' | 'clipped' | 'overlap' | 'tap-too-small' | 'tap-small' | 'resize';

/** What each check means and the usual fix. Shown in test failures, attachments and the responsive report. */
export const checks: Record<IssueKind, { title: string; severity: 'error' | 'warning'; fix: string }> = {
  overflow: {
    title: 'Page scrolls sideways',
    severity: 'error',
    fix: 'Something is wider than the window (the outlined "cut off" items show what). Give it max-width: 100%, add min-width: 0 to flex/grid children so they can shrink, or wrap wide content (tables) in a container with overflow-x: auto.',
  },
  offscreen: {
    title: 'Cut off at the window edge',
    severity: 'error',
    fix: 'Usually a fixed width (width: 600px), a flex row that cannot wrap, or a grid with fixed columns. Use max-width: 100%, flex-wrap: wrap, or grid-template-columns: repeat(auto-fit, minmax(<min>, 1fr)); stack the items at this breakpoint if they cannot fit side by side.',
  },
  clipped: {
    title: 'Content wider than its card',
    severity: 'error',
    fix: 'The chart/table/heat map inside the card does not shrink with the card. Size it from its container (Recharts: <ResponsiveContainer width="100%">; SVG: viewBox + width: 100%), add min-width: 0 on the card in a flex/grid layout, or let the card scroll with overflow-x: auto.',
  },
  overlap: {
    title: 'Top bar items overlap',
    severity: 'error',
    fix: 'The top bar does not have room for all its items at this width. Let it wrap (flex-wrap: wrap), truncate the title (text-overflow: ellipsis; min-width: 0), or collapse the search / actions into an icon button at this breakpoint.',
  },
  'tap-too-small': {
    title: 'Tap target smaller than 24×24px (WCAG 2.5.8)',
    severity: 'error',
    fix: 'Increase padding, or set min-width / min-height: 24px (44px recommended) on the button or link. The icon can stay small; the clickable area should grow.',
  },
  'tap-small': {
    title: 'Tap target below recommended 44×44px',
    severity: 'warning',
    fix: 'Not a failure. On touch screens, consider min-height: 44px and enough spacing between neighbouring targets.',
  },
  resize: {
    title: "Cut off after resizing desktop → iPad (doesn't adapt)",
    severity: 'error',
    fix: 'Fine when the page loads at tablet size, broken after the window shrinks: the component measures its width only once. Re-measure on resize (ResizeObserver, Recharts ResponsiveContainer, chart.resize()), or size it with CSS instead of a width computed in JS.',
  },
};

/** An issue as reported: numbered (matching the badge in the screenshot) and with its check's details. */
export interface ReportedIssue extends LayoutIssue {
  n: number;
  kind: IssueKind;
  check: string;
  severity: 'error' | 'warning';
  fix: string;
}

/** Number all issues found on a page, in check order, so the list and the screenshot badges match. */
export function numberIssues(found: [IssueKind, LayoutIssue[]][]): ReportedIssue[] {
  let n = 0;
  return found.flatMap(([kind, list]) =>
    list.map((i) => ({ ...i, n: ++n, kind, check: checks[kind].title, severity: checks[kind].severity, fix: checks[kind].fix })),
  );
}

/** Failure message for one check: numbered elements plus how to fix. */
export function describeIssues(kind: IssueKind, issues: ReportedIssue[]): string {
  const mine = issues.filter((i) => i.kind === kind);
  return `${checks[kind].title}:\n${mine.map((i) => `  #${i.n} ${i.element}: ${i.detail}`).join('\n')}\n  How to fix: ${checks[kind].fix}\n  (see the "layout-issues.png" attachment: the numbers match)`;
}

/**
 * Defines window.__markLayout(el), which tags an element with a stable data-layout-id so it can be
 * outlined later. The checks below call it for every element they report.
 */
async function installMarker(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__markLayout ??= (el: Element) => {
      let id = el.getAttribute('data-layout-id');
      if (!id) {
        w.__layoutSeq = (w.__layoutSeq ?? 0) + 1;
        id = String(w.__layoutSeq);
        el.setAttribute('data-layout-id', id);
      }
      return Number(id);
    };
  });
}

/**
 * Full-page screenshot with every reported element outlined (red = error, amber = warning) and
 * labelled with its issue number. A dashed blue line marks the window's right edge when something
 * is cut off there. Returns null when there is nothing to outline.
 */
export async function captureHighlighted(page: Page, issues: ReportedIssue[]): Promise<Buffer | null> {
  const boxes = issues
    .filter((i) => i.ids?.length)
    .map((i) => ({ n: i.n, ids: i.ids!, color: i.severity === 'error' ? '#e5484d' : '#f59e0b', edge: i.kind === 'offscreen' || i.kind === 'resize' }));
  if (!boxes.length) return null;
  // The content scrolls inside main.app-content, so a plain fullPage shot only paints the first
  // screen. Expand it like the screenshot tests do. Call this only after all checks have run:
  // it makes the window as tall as the page.
  await expandScrollContainer(page, { keepWidth: true });
  await page.evaluate((boxes) => {
    const vw = document.documentElement.clientWidth;
    const docW = Math.max(document.documentElement.scrollWidth, vw);
    const docH = document.documentElement.scrollHeight;
    const layer = document.createElement('div');
    layer.id = '__layout-overlay';
    Object.assign(layer.style, { position: 'absolute', left: '0', top: '0', width: '0', height: '0', zIndex: '2147483647', pointerEvents: 'none' });
    document.body.appendChild(layer);
    const add = (style: Partial<CSSStyleDeclaration>, text = '') => {
      const d = document.createElement('div');
      Object.assign(d.style, { position: 'absolute', boxSizing: 'border-box', font: 'bold 12px/16px system-ui, sans-serif' }, style);
      d.textContent = text;
      layer.appendChild(d);
      return d;
    };
    for (const b of boxes)
      for (const id of b.ids) {
        const el = document.querySelector(`[data-layout-id="${id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const left = Math.max(0, r.left + window.scrollX);
        const right = Math.min(docW, r.right + window.scrollX);
        const top = r.top + window.scrollY;
        add({ left: `${left}px`, top: `${top}px`, width: `${Math.max(right - left, 6)}px`, height: `${Math.max(r.height, 6)}px`, border: `3px solid ${b.color}`, background: `${b.color}22` });
        add({ left: `${left}px`, top: `${Math.max(0, top - 18)}px`, padding: '1px 5px', background: b.color, color: '#fff', borderRadius: '3px' }, `#${b.n}`);
      }
    if (boxes.some((b) => b.edge)) {
      add({ left: `${vw - 1}px`, top: '0', width: '0', height: `${docH}px`, borderLeft: '2px dashed #2563eb' });
      add({ left: `${Math.max(0, vw - 120)}px`, top: '4px', padding: '1px 5px', background: '#2563eb', color: '#fff', borderRadius: '3px' }, `window edge ${vw}px`);
    }
  }, boxes);
  try {
    return await page.screenshot({ fullPage: true, animations: 'disabled' });
  } finally {
    await page.evaluate(() => document.getElementById('__layout-overlay')?.remove());
  }
}

/**
 * Attaches the findings to the test so they show up in the Playwright HTML report:
 *  - layout-issues.png  the page with offending elements outlined and numbered
 *  - layout-issues.txt  numbered list with how to fix each kind of problem
 *  - layout-issues.json the same data, read by tests/support/responsive-reporter.ts
 */
export async function attachLayoutReport(page: Page, testInfo: TestInfo, issues: ReportedIssue[]) {
  await testInfo.attach('layout-issues.json', { body: JSON.stringify(issues, null, 2), contentType: 'application/json' });
  if (!issues.length) return;
  const png = await captureHighlighted(page, issues);
  if (png) await testInfo.attach('layout-issues.png', { body: png, contentType: 'image/png' });
  const kinds = [...new Set(issues.map((i) => i.kind))];
  const text = kinds
    .map((k) => {
      const list = issues.filter((i) => i.kind === k);
      return `${checks[k].severity.toUpperCase()}: ${checks[k].title} (${list.length})\n` +
        list.map((i) => `  #${i.n} ${i.element}\n      ${i.detail}`).join('\n') +
        `\n  How to fix: ${checks[k].fix}`;
    })
    .join('\n\n');
  await testInfo.attach('layout-issues.txt', { body: text, contentType: 'text/plain' });
}

/** Horizontal overflow of the window and of the app's inner scroll area (main.app-content). */
export async function horizontalOverflow(page: Page): Promise<LayoutIssue[]> {
  return page.evaluate((sel) => {
    const issues: { element: string; detail: string }[] = [];
    const doc = document.scrollingElement as HTMLElement;
    if (doc.scrollWidth > doc.clientWidth + 1)
      issues.push({ element: 'page', detail: `content is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px window` });
    const main = document.querySelector<HTMLElement>(sel);
    if (main && main.scrollWidth > main.clientWidth + 1)
      issues.push({ element: sel, detail: `content is ${main.scrollWidth}px wide in a ${main.clientWidth}px area (scrolls sideways)` });
    return issues;
  }, scrollContainer);
}

/**
 * Visible elements that stick out past the right/left edge of the window.
 * Ignores content inside intentional horizontal scroll areas (overflow-x: auto/scroll, e.g. wide
 * tables) and anything inside an off-canvas panel (e.g. the closed mobile sidebar).
 * Only the outermost offender of each overflowing branch is reported.
 */
export async function offscreenElements(page: Page, limit = 15): Promise<LayoutIssue[]> {
  await installMarker(page);
  return page.evaluate((limit) => {
    const mark = (window as any).__markLayout as (el: Element) => number;
    const vw = document.documentElement.clientWidth;
    const path = (el: Element) => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
        const cls = (e.getAttribute('class') ?? '').split(/\s+/).filter((c) => c && !c.includes(':') && !c.includes('[')).slice(0, 2);
        parts.unshift(e.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : ''));
      }
      const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, ' ').slice(0, 30);
      return parts.join(' > ') + (text ? ` "${text}"` : '');
    };
    const parkedOffCanvas = (e: Element) => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return (s.position === 'fixed' || s.position === 'absolute') && (r.right <= 0 || r.left >= vw);
    };
    const insideScrollerOrOffCanvas = (el: Element) => {
      if (parkedOffCanvas(el)) return true; // e.g. the closed mobile sidebar itself
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth) return true;
        if (parkedOffCanvas(e)) return true;
        // Clipped by a container that itself fits in the window: not visible past the edge.
        // (Content cut off inside a card is reported by clippedCards instead.)
        const r = e.getBoundingClientRect();
        if (/(hidden|clip)/.test(s.overflowX) && r.right <= vw + 1 && r.left >= -1) return true;
      }
      return false;
    };
    const offenders: Element[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      if (offenders.some((o) => o.contains(el))) continue; // already reported its ancestor
      if (insideScrollerOrOffCanvas(el)) continue;
      offenders.push(el);
      if (offenders.length >= limit) break;
    }
    return offenders.map((el) => {
      const r = el.getBoundingClientRect();
      const side = r.right > vw + 1 ? `right edge at ${Math.round(r.right)}px (window ${vw}px)` : `left edge at ${Math.round(r.left)}px`;
      return { element: path(el), detail: side, ids: [mark(el)] };
    });
  }, limit);
}

/**
 * Cards whose content is wider than the card, so part of a chart, table or heat map is hidden or
 * spills out (e.g. the Facility heat map losing its last columns). Cards that are meant to scroll
 * sideways (overflow-x: auto/scroll) are fine.
 */
export async function clippedCards(page: Page): Promise<LayoutIssue[]> {
  await installMarker(page);
  return page.evaluate(() => {
    const mark = (window as any).__markLayout as (el: Element) => number;
    const issues: { element: string; detail: string; ids: number[] }[] = [];
    for (const card of Array.from(document.querySelectorAll<HTMLElement>('main .card'))) {
      const r = card.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const scrollers = [card, ...Array.from(card.querySelectorAll<HTMLElement>('*'))].filter(
        (e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX),
      );
      // Intentional cropping inside the card (e.g. the 3D model image in its own overflow:hidden frame).
      const croppers = Array.from(card.querySelectorAll<HTMLElement>('*')).filter((e) =>
        /(hidden|clip)/.test(getComputedStyle(e).overflowX),
      );
      // Widest normal-flow descendant that is not inside an intentional scroll or crop area.
      // Absolutely positioned decorations (badges, tooltips, sun-path markers) are ignored.
      let widest = r.right;
      let culprit: Element | null = null;
      for (const el of Array.from(card.querySelectorAll('*'))) {
        if (scrollers.some((s) => s !== card && s.contains(el))) continue;
        if (croppers.some((c) => c !== el && c.contains(el))) continue;
        let positioned = false;
        for (let e: Element | null = el; e && e !== card; e = e.parentElement)
          if (/(absolute|fixed)/.test(getComputedStyle(e).position)) { positioned = true; break; }
        if (positioned) continue;
        const er = el.getBoundingClientRect();
        if (er.width === 0 || er.height === 0) continue;
        if (er.right > widest + 1) { widest = er.right; culprit = el; }
      }
      if (culprit && !scrollers.includes(card)) {
        const title = card.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"]')?.textContent?.trim().slice(0, 40)
          ?? card.innerText.trim().split('\n')[0].slice(0, 40);
        const what = culprit.tagName.toLowerCase() + ((culprit.getAttribute('class') ?? '').split(/\s+/)[0] ? '.' + (culprit.getAttribute('class') ?? '').split(/\s+/)[0] : '');
        issues.push({ element: `card "${title}"`, detail: `${what} extends ${Math.round(widest - r.right)}px past the card's right edge`, ids: [mark(card), mark(culprit)] });
      }
    }
    return issues;
  });
}

/** Items inside the top bar whose boxes overlap each other (e.g. title running under the search box). */
export async function headerOverlaps(page: Page): Promise<LayoutIssue[]> {
  await installMarker(page);
  return page.evaluate(() => {
    const mark = (window as any).__markLayout as (el: Element) => number;
    const header = document.querySelector('header') ?? document.querySelector('[class*="topbar"]');
    if (!header) return [];
    // Direct visible children of the header's main row, plus fixed buttons drawn on top of it (mobile menu).
    const row = Array.from(header.children).length === 1 ? header.children[0] : header;
    const items = Array.from(row.children) as HTMLElement[];
    const fixed = Array.from(document.querySelectorAll<HTMLElement>('button')).filter(
      (b) => getComputedStyle(b).position === 'fixed' && b.getBoundingClientRect().top < header.getBoundingClientRect().bottom,
    );
    const boxes = [...items, ...fixed]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden');
    const label = (el: HTMLElement) =>
      (el.getAttribute('aria-label') || el.innerText || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
    const issues: { element: string; detail: string; ids: number[] }[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (boxes[i].el.contains(boxes[j].el) || boxes[j].el.contains(boxes[i].el)) continue;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 2 && h > 2)
          issues.push({ element: `"${label(boxes[i].el)}" / "${label(boxes[j].el)}"`, detail: `overlap ${Math.round(w)}x${Math.round(h)}px`, ids: [mark(boxes[i].el), mark(boxes[j].el)] });
      }
    return issues;
  });
}

/**
 * Tap targets on touch screens. WCAG 2.2 (2.5.8) requires at least 24x24px; 44x44px is the
 * recommended comfortable size (Apple/Google guidelines). Returns both lists.
 */
export async function smallTapTargets(page: Page): Promise<{ tooSmall: LayoutIssue[]; belowRecommended: LayoutIssue[] }> {
  await installMarker(page);
  return page.evaluate(() => {
    const mark = (window as any).__markLayout as (el: Element) => number;
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=checkbox]';
    const tooSmall: { element: string; detail: string; ids: number[] }[] = [];
    const belowRecommended: { element: string; detail: string; ids: number[] }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none') continue;
      if (r.right <= 0 || r.left >= window.innerWidth) continue; // off-canvas
      // Text links inside a sentence are exempt from the WCAG target-size rule.
      if (el.tagName === 'A' && el.parentElement && getComputedStyle(el).display === 'inline') continue;
      const label = (el.getAttribute('aria-label') || el.innerText || (el as HTMLInputElement).placeholder || el.tagName)
        .trim().replace(/\s+/g, ' ').slice(0, 30);
      const item = { element: `${el.tagName.toLowerCase()} "${label}"`, detail: `${Math.round(r.width)}x${Math.round(r.height)}px`, ids: [mark(el)] };
      if (r.width < 24 || r.height < 24) tooSmall.push(item);
      else if (r.width < 44 || r.height < 44) belowRecommended.push(item);
    }
    return { tooSmall, belowRecommended };
  });
}

export const formatIssues = (issues: LayoutIssue[]) => issues.map((i) => `  - ${i.element}: ${i.detail}`).join('\n');
