// Opens responsive-report/index.html (written by tests/support/responsive-reporter.ts) in the default browser.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const file = resolve('responsive-report', 'index.html');
if (!existsSync(file)) {
  console.error('No responsive report yet. Run "npm run test:layout" (or "npm run test:visual") first.');
  process.exit(1);
}
const [cmd, args] =
  process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]]
  : process.platform === 'darwin' ? ['open', [file]]
  : ['xdg-open', [file]];
spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
console.log(`Opened ${file}`);
