import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import type { ReportedIssue } from './layout';
import { resizeTarget } from './devices';

/**
 * Builds responsive-report/index.html from the layout: and resize: tests: a grid of pages × screen
 * sizes, a "what to fix" summary, and per-cell details with the outlined screenshot.
 * Runs alongside the HTML reporter (see playwright.config.ts). A run without layout/resize tests
 * (e.g. npm run test:screenshots) leaves the previous report untouched.
 */

interface Cell {
  page: string;
  column: string;
  status: TestResult['status'];
  issues: ReportedIssue[];
  image?: string;
  error?: string;
}

const RESIZE_COLUMN = `resize 1440→${resizeTarget.viewport.width}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

function attachment(result: TestResult, name: string): Buffer | undefined {
  const a = result.attachments.find((x) => x.name === name);
  if (!a) return undefined;
  if (a.body) return a.body;
  if (a.path && fs.existsSync(a.path)) return fs.readFileSync(a.path);
  return undefined;
}

class ResponsiveReporter implements Reporter {
  private outDir: string;
  private columns: string[] = [];
  private cells = new Map<string, Cell>();
  private prepared = false;

  constructor(options: { outputFolder?: string } = {}) {
    this.outDir = path.resolve(options.outputFolder ?? 'responsive-report');
  }

  printsToStdio() {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite) {
    this.columns = [...config.projects.map((p) => p.name).filter((n) => n !== 'setup'), RESIZE_COLUMN];
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'skipped') return;
    const m = /^(layout|resize): (.+?)(?: \(| desktop -> |$)/.exec(test.title);
    if (!m) return;
    if (!this.prepared) {
      // Clear the previous report only once this run actually has responsive results.
      fs.rmSync(this.outDir, { recursive: true, force: true });
      fs.mkdirSync(path.join(this.outDir, 'images'), { recursive: true });
      this.prepared = true;
    }
    const pageName = m[2];
    const column = m[1] === 'resize' ? RESIZE_COLUMN : test.parent.project()?.name ?? 'unknown';

    const json = attachment(result, 'layout-issues.json');
    const issues: ReportedIssue[] = json ? JSON.parse(json.toString('utf8')) : [];

    let image: string | undefined;
    const png = attachment(result, 'layout-issues.png');
    if (png) {
      image = `images/${slug(pageName)}--${slug(column)}.png`;
      fs.writeFileSync(path.join(this.outDir, image), png);
    }

    // Errors not covered by the issue list (timeouts, crashes, the mobile menu test).
    let error: string | undefined;
    if (result.status !== 'passed' && !issues.some((i) => i.severity === 'error'))
      error = stripAnsi(result.errors.map((e) => e.message ?? e.value ?? '').join('\n')).split('\n').slice(0, 12).join('\n') || result.status;

    this.cells.set(`${pageName}\u0000${column}`, { page: pageName, column, status: result.status, issues, image, error });
  }

  onEnd() {
    if (!this.prepared) return;
    const file = path.join(this.outDir, 'index.html');
    fs.writeFileSync(file, this.render());
    fs.writeFileSync(path.join(this.outDir, 'issues.json'), JSON.stringify([...this.cells.values()], null, 2));
    console.log(`\nResponsiveness report: ${path.relative(process.cwd(), file)}  (npm run report:responsive)`);
  }

  private render(): string {
    const cells = [...this.cells.values()];
    const pages = [...new Set(cells.map((c) => c.page))].sort();
    const columns = this.columns.filter((col) => cells.some((c) => c.column === col));
    const get = (p: string, col: string) => this.cells.get(`${p}\u0000${col}`);
    const anchor = (c: Cell) => `d-${slug(c.page)}--${slug(c.column)}`;
    const errs = (c: Cell) => c.issues.filter((i) => i.severity === 'error').length;
    const warns = (c: Cell) => c.issues.filter((i) => i.severity === 'warning').length;
    const failed = (c: Cell) => errs(c) > 0 || !!c.error;

    const grid = pages
      .map((p) => {
        const tds = columns
          .map((col) => {
            const c = get(p, col);
            if (!c) return '<td class="na">–</td>';
            const e = errs(c), w = warns(c);
            const label = c.error && !e ? 'test error' : e ? `${e} issue${e > 1 ? 's' : ''}` : w ? `${w} warning${w > 1 ? 's' : ''}` : 'OK';
            const cls = failed(c) ? 'bad' : w ? 'warn' : 'ok';
            const inner = failed(c) || w ? `<a href="#${anchor(c)}">${label}</a>` : label;
            return `<td class="${cls}">${inner}${e && w ? `<small>+${w} warn</small>` : ''}</td>`;
          })
          .join('');
        return `<tr><th scope="row">${esc(p)}</th>${tds}</tr>`;
      })
      .join('\n');

    // What to fix: every error kind, how often, where, and the fix.
    const byKind = new Map<string, { check: string; severity: string; fix: string; where: string[]; count: number }>();
    for (const c of cells)
      for (const i of c.issues) {
        const k = byKind.get(i.kind) ?? { check: i.check, severity: i.severity, fix: i.fix, where: [], count: 0 };
        k.count++;
        const w = `${c.page} @ ${c.column}`;
        if (!k.where.includes(w)) k.where.push(w);
        byKind.set(i.kind, k);
      }
    const fixes = [...byKind.values()]
      .sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'error' ? -1 : 1))
      .map(
        (k) => `<div class="fix ${k.severity}">
  <h3>${esc(k.check)} <span class="pill">${k.count} in ${k.where.length} page/size${k.where.length > 1 ? 's' : ''}</span></h3>
  <p>${esc(k.fix)}</p>
  <details><summary>Where</summary><p class="where">${k.where.map(esc).join(' · ')}</p></details>
</div>`,
      )
      .join('\n');

    const details = cells
      .filter((c) => failed(c) || warns(c))
      .sort((a, b) => a.page.localeCompare(b.page) || columns.indexOf(a.column) - columns.indexOf(b.column))
      .map((c) => {
        const kinds = [...new Set(c.issues.map((i) => i.kind))];
        const lists = kinds
          .map((k) => {
            const list = c.issues.filter((i) => i.kind === k);
            return `<h4 class="${list[0].severity}">${esc(list[0].check)} (${list.length})</h4>
<ol>${list.map((i) => `<li value="${i.n}"><code>${esc(i.element)}</code><br><span>${esc(i.detail)}</span></li>`).join('')}</ol>
<p class="how"><b>How to fix:</b> ${esc(list[0].fix)}</p>`;
          })
          .join('');
        const err = c.error ? `<pre class="err">${esc(c.error)}</pre>` : '';
        const img = c.image
          ? `<a class="shot" href="${c.image}" target="_blank" title="Open full size"><img loading="lazy" src="${c.image}" alt="${esc(c.page)} at ${esc(c.column)} with problems outlined"></a>`
          : '';
        return `<section class="detail" id="${anchor(c)}">
  <h2>${esc(c.page)} <span class="size">@ ${esc(c.column)}</span></h2>
  <div class="cols"><div class="list">${err}${lists}<p><a href="#top">↑ back to grid</a></p></div>${img}</div>
</section>`;
      })
      .join('\n');

    const total = cells.length;
    const bad = cells.filter(failed).length;
    const warnOnly = cells.filter((c) => !failed(c) && warns(c)).length;

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Responsiveness Report</title>
<style>
:root { --bg:#fff; --fg:#1b1d22; --muted:#626873; --line:#e3e5e8; --card:#f7f8fa;
  --ok:#1f8a4c; --ok-bg:#e8f6ee; --bad:#c62f35; --bad-bg:#fdecec; --warn:#a15c00; --warn-bg:#fff4e0; --link:#2458d6; }
@media (prefers-color-scheme: dark) { :root { --bg:#14161a; --fg:#e7e9ec; --muted:#9aa1ab; --line:#2b2f36; --card:#1c1f24;
  --ok:#5fd08d; --ok-bg:#16301f; --bad:#ff8a8f; --bad-bg:#3a1b1d; --warn:#ffc266; --warn-bg:#3a2a12; --link:#8fb0ff; } }
* { box-sizing:border-box; }
body { margin:0; padding:24px 16px 64px; background:var(--bg); color:var(--fg); font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
main { max-width:1280px; margin:0 auto; }
h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:18px; margin:0 0 12px; } h3 { font-size:15px; margin:0 0 4px; } h4 { margin:14px 0 4px; font-size:14px; }
.muted { color:var(--muted); } a { color:var(--link); }
.stats { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 24px; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 14px; }
.stat b { font-size:20px; display:block; font-variant-numeric:tabular-nums; }
.table-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:8px; }
table { border-collapse:collapse; width:100%; font-variant-numeric:tabular-nums; }
th, td { padding:7px 10px; border-bottom:1px solid var(--line); text-align:center; white-space:nowrap; }
thead th { background:var(--card); font-weight:600; position:sticky; top:0; }
th[scope=row] { text-align:left; font-weight:500; }
td.ok { color:var(--ok); background:var(--ok-bg); } td.bad { background:var(--bad-bg); font-weight:600; } td.bad a { color:var(--bad); }
td.warn { background:var(--warn-bg); } td.warn a { color:var(--warn); } td.na { color:var(--muted); }
td small { display:block; font-weight:400; color:var(--warn); }
.fix { border:1px solid var(--line); border-left:4px solid var(--bad); border-radius:8px; padding:12px 14px; margin:10px 0; background:var(--card); }
.fix.warning { border-left-color:var(--warn); } .fix p { margin:4px 0; }
.pill { font-size:12px; font-weight:500; color:var(--muted); margin-left:6px; }
.where { color:var(--muted); font-size:13px; }
.detail { border-top:1px solid var(--line); padding-top:20px; margin-top:28px; scroll-margin-top:12px; }
.size { color:var(--muted); font-weight:400; }
.cols { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:20px; align-items:start; }
@media (max-width: 900px) { .cols { grid-template-columns:minmax(0,1fr); } }
h4.error { color:var(--bad); } h4.warning { color:var(--warn); }
ol { margin:4px 0; padding-left:28px; } li { margin:4px 0; } li::marker { font-weight:700; }
code { font-size:12px; word-break:break-all; }
.how { background:var(--card); border-radius:6px; padding:8px 10px; margin:6px 0 0; }
.shot { display:block; max-height:80vh; overflow:auto; border:1px solid var(--line); border-radius:8px; }
.shot img { display:block; width:100%; height:auto; }
pre.err { white-space:pre-wrap; background:var(--bad-bg); color:var(--bad); padding:10px; border-radius:6px; font-size:12px; }
</style></head>
<body><main id="top">
<h1>Responsiveness report</h1>
<p class="muted">Generated ${esc(new Date().toLocaleString())} · layout checks at each screen size, plus the desktop → ${esc(resizeTarget.name)} (${resizeTarget.viewport.width}px) resize check. Touch sizes are real devices: iPhone 15, Pixel 7, iPad (gen 7). Red = must fix, amber = recommended.</p>
<div class="stats">
  <div class="stat"><b>${pages.length}</b>pages</div>
  <div class="stat"><b>${total}</b>page/size checks</div>
  <div class="stat"><b style="color:var(--bad)">${bad}</b>with problems</div>
  <div class="stat"><b style="color:var(--warn)">${warnOnly}</b>warnings only</div>
  <div class="stat"><b style="color:var(--ok)">${total - bad - warnOnly}</b>clean</div>
</div>
<h2>Pages × screen sizes</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col" style="text-align:left">page</th>${columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${grid}</tbody></table></div>
${fixes ? `<h2 style="margin-top:32px">What to fix</h2>${fixes}` : '<p>No responsive problems found.</p>'}
${details}
</main></body></html>`;
  }
}

export default ResponsiveReporter;
