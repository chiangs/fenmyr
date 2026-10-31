// Before Claude finishes, run the fast checks; failures go back to Claude once, then it may stop.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
const retried =
  typeof input === 'object' && input !== null && 'stop_hook_active' in input && input.stop_hook_active === true;
if (retried) process.exit(0);
const check = spawnSync('npm', ['run', '--silent', 'check:fast'], {
  cwd: process.env.CLAUDE_PROJECT_DIR,
  encoding: 'utf8',
});
if (check.status === 0) process.exit(0);
process.stderr.write(`npm run check:fast failed. Fix it before finishing:\n${check.stdout}${check.stderr}`);
process.exit(2);
