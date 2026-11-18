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

// a fourth value is the old value in dark mode: a swap that was a different colour there
const swapped = compare([['background', '#ffffff', 'var(--surface)', '#242019']]);
assert.strictEqual(swapped.status, 0, `a dark swap is compared against its dark value: ${swapped.stdout}`);
assert.strictEqual(
  compare([['background', '#ffffff', 'var(--surface)']]).status,
  1,
  'without it the dark mode differs',
);

// a tolerance accepts a colour that looks the same, and a mix the browser reports as oklch()
const near = (tolerance: string, after: string) => {
  const file = path.join(dir, 'near.json');
  fs.writeFileSync(file, JSON.stringify([['background', '#f4f0ed', after, '#2e2922']]));
  return spawnSync('node', [tool, file, '--tolerance', tolerance], { encoding: 'utf8' });
};
assert.strictEqual(near('0.02', 'var(--surface-2)').status, 0, 'the same colour passes');
assert.strictEqual(
  near('0.02', 'color-mix(in oklch, var(--ink-faint) 45%, var(--surface))').status,
  1,
  'a different one fails',
);
assert.strictEqual(
  near('0.2', 'color-mix(in oklch, var(--ink-faint) 45%, var(--surface))').status,
  0,
  'unless the tolerance allows',
);
// a fifth value limits a pair to one mode: a token used in light rules alone isn't held to anything in dark
const lightOnly = compare([['background', '#ffffff', 'var(--surface)', '#000000', 'light']]);
assert.strictEqual(lightOnly.status, 0, `a light-only pair ignores dark mode: ${lightOnly.stdout}`);
assert.strictEqual(
  compare([['background', '#ffffff', 'var(--surface)', '#000000']]).status,
  1,
  'and is held to it without',
);

fs.rmSync(dir, { recursive: true, force: true });
console.log('COLOUR COMPARE OK');
