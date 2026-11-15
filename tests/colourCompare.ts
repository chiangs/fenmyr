// tools/colour-compare.ts proves a conversion changed nothing, in the running app: it passes when the new value
// computes to the old colour in light and dark mode (alpha forms and rgba() written two ways included), and fails,
// naming the declaration, when it doesn't.
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-compare-')),
  tool = path.join(import.meta.dirname, '..', 'tools', 'colour-compare.ts');
const compare = (pairs: string[][]) => {
  const file = path.join(dir, 'pairs.json');
  fs.writeFileSync(file, JSON.stringify(pairs));
  return spawnSync('node', [tool, file], { encoding: 'utf8' });
};

const same = compare([
  ['color', '#fff', 'var(--hilite)'],
  ['background', 'rgba(255, 255, 255, .5)', 'rgb(from var(--hilite) r g b / .5)'],
  ['box-shadow', '0 1px 2px rgba(0, 0, 0, .35)', '0 1px 2px rgb(from var(--shade) r g b / .35)'],
]);
assert.strictEqual(same.status, 0, `true pairs pass: ${same.stdout}${same.stderr}`);
assert.match(same.stdout, /SAME: 3 declarations/);

const different = compare([
  ['color', '#fff', 'var(--hilite)'],
  ['color', '#fff', '#000'],
  ['background', 'rgba(255, 255, 255, .5)', 'rgb(from var(--hilite) r g b / .6)'],
  ['color', '#fff', 'var(--no-such-token)'],
  ['color', '#fff', 'rgb(1 2'],
]);
assert.strictEqual(different.status, 1, 'a false pair fails the run');
assert.match(
  different.stdout,
  /light color: rgb\(255, 255, 255\)\s+vs\s+rgb\(0, 0, 0\)/,
  'and says which colour changed',
);
assert.match(different.stdout, /dark color/, 'in dark mode too');
assert.match(different.stdout, /background: .*0\.5.*vs.*0\.6/, 'a different alpha is a difference');
assert.match(different.stdout, /rejects rgb\(1 2/, 'a value the browser can\u2019t parse is called out');
// an undefined variable falls back to the inherited colour, which isn't white, so it shows up as a difference too
assert.match(
  different.stdout,
  /DIFFERENT: 8 differences in 5 declarations/,
  'the true pair adds nothing, the other four give two each',
);

fs.rmSync(dir, { recursive: true, force: true });
console.log('COLOUR COMPARE OK');
