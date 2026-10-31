// After an edit to a TypeScript file, type check the project and hand any errors back to Claude.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

// a fresh clone, or a folder that only ran install.sh, has no dev tools to run
if (!existsSync(`${process.env.CLAUDE_PROJECT_DIR}/node_modules/.bin/tsc`)) process.exit(0);
const input: unknown = JSON.parse(readFileSync(0, 'utf8'));
const edited =
  typeof input === 'object' &&
  input !== null &&
  'tool_input' in input &&
  typeof input.tool_input === 'object' &&
  input.tool_input !== null &&
  'file_path' in input.tool_input
    ? String(input.tool_input.file_path)
    : '';
if (!/\.tsx?$/.test(edited)) process.exit(0);
const tsc = spawnSync('npx', ['tsc'], { cwd: process.env.CLAUDE_PROJECT_DIR, encoding: 'utf8' });
if (tsc.status === 0) process.exit(0);
process.stderr.write(tsc.stdout + tsc.stderr);
process.exit(2);
