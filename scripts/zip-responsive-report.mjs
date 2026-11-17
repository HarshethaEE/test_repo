// Packs responsive-report/ into responsive-report-<date>.zip to send to developers.
// The receiver unzips it and double-clicks index.html: no server or install needed.
import { existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (!existsSync('responsive-report/index.html')) {
  console.error('No responsive report yet. Run "npm run test:layout" (or "npm run test:visual") first.');
  process.exit(1);
}
const out = `responsive-report-${new Date().toISOString().slice(0, 10)}.zip`;
rmSync(out, { force: true });
if (process.platform === 'win32')
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path responsive-report -DestinationPath '${out}'`], { stdio: 'inherit' });
else execFileSync('zip', ['-rq', out, 'responsive-report'], { stdio: 'inherit' });
console.log(`Created ${out}: send it, then unzip and open responsive-report/index.html`);
