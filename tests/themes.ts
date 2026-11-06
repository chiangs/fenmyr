// Every colour theme keeps its promise: AA or AAA contrast for text, focus and card text, and card colours that stay
// apart for every kind of colour blindness. Gaps a theme is known to have are recorded, and must still be real.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { checksOf, THEMES } from '../src/web/settings/themes.ts';
import { apart, contrast } from '../src/web/ui/color.ts';

assert.strictEqual(Math.round(contrast('#000000', '#ffffff') * 10) / 10, 21, 'black on white is 21:1');
assert.strictEqual(contrast('#777777', '#777777'), 1, 'a colour on itself is 1:1');
assert.strictEqual(apart('#ffe3bd', '#ffe3bd', 'deutan'), 0, 'a colour is no distance from itself');
assert.ok(
  apart('#ff0000', '#00ff00', 'typical') > apart('#ff0000', '#00ff00', 'deutan'),
  'red and green close up for deutan vision',
);

const problems: string[] = [];
for (const t of THEMES) {
  for (const c of checksOf(t)) {
    const passes = c.got >= c.need,
      known = t.knownGaps.includes(c.id);
    if (!passes && !known) problems.push(`${t.id}: ${c.id} is ${c.got}, needs ${c.need} (${c.worst})`);
    if (passes && known) problems.push(`${t.id}: ${c.id} now passes (${c.got}), so take it out of knownGaps`);
  }
}
assert.deepStrictEqual(problems, [], 'every theme keeps its promise');

// until the stylesheet reads its colours from this table, the two must agree
const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'web', 'style.css'), 'utf8');
const declared = (block: RegExp, name: string) =>
  css.match(block)?.[1]?.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))?.[1];
const ROOT = /:root \{([^}]*)\}/,
  DARK = /body\.dark \{ --sh: [^}]*\}/;
const light = THEMES.find(t => t.id === 'default-light')?.tokens,
  dark = THEMES.find(t => t.id === 'default-dark')?.tokens;
assert.ok(light && dark, 'both Default themes are in the table');
const lightVars: [string, string][] = [
  ['--ink', light.ink],
  ['--ink-soft', light.inkSoft],
  ['--dot', light.dot],
  ['--pink-deep', light.accent],
  ['--select', light.focus],
];
for (const [name, value] of lightVars)
  assert.strictEqual(declared(ROOT, name), value, `style.css :root ${name} matches the light Default`);
const darkCss = css.match(DARK)?.[0] ?? '';
const darkVars: [string, string][] = [
  ['--ink', dark.ink],
  ['--ink-soft', dark.inkSoft],
  ['--dot', dark.dot],
];
for (const [name, value] of darkVars)
  assert.ok(darkCss.includes(`${name}: ${value}`), `style.css body.dark ${name} matches the dark Default`);

console.log(`THEMES OK (${THEMES.length} themes)`);
