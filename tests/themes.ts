// Every colour theme keeps its promise: AA or AAA contrast for text, focus and card text, and card colours that stay
// apart for every kind of colour blindness. Gaps a theme is known to have are recorded, and must still be real.
import assert from 'node:assert';
import { accentOver, NON_TEXT, TEXT } from '../src/web/settings/derive.ts';
import { checksOf } from '../src/web/settings/themeChecks.ts';
import { cardVars, THEMES } from '../src/web/settings/themes.ts';
import { apart, bestInk, contrast, readableShade } from '../src/web/ui/color.ts';

assert.strictEqual(Math.round(contrast('#000000', '#ffffff') * 10) / 10, 21, 'black on white is 21:1');
assert.strictEqual(contrast('#777777', '#777777'), 1, 'a colour on itself is 1:1');
assert.strictEqual(apart('#ffe3bd', '#ffe3bd', 'deutan'), 0, 'a colour is no distance from itself');
assert.ok(
  apart('#ff0000', '#00ff00', 'typical') > apart('#ff0000', '#00ff00', 'deutan'),
  'red and green close up for deutan vision',
);

// a custom accent of any colour still makes links and button text that read at 4.5:1
for (const accent of ['#e88a24', '#ffd76a', '#7fb86a', '#0d99ff', '#7c4dff', '#ff5a6e', '#ffffff', '#000000'])
  for (const [mode, surfaces, ink] of [
    ['light', ['#ffffff', '#faf7f2'], '#3b342d'],
    ['dark', ['#242019', '#12100d'], '#1d1a16'],
  ] as const) {
    const text = readableShade(accent, [...surfaces], 4.5);
    for (const s of surfaces)
      assert.ok(contrast(text, s) >= 4.5, `${mode}: links from accent ${accent} read on ${s} (${text})`);
    const on = bestInk(accent, ['#ffffff', ink]);
    assert.ok(contrast(on, accent) >= 4, `${mode}: text on accent ${accent} reads (${on})`);
  }

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

// the strong border is the decorative one where that already reads on the panel, and a stronger one where it doesn't; a
// theme's pen is its ink, except Default dark's, which has always been a shade softer
for (const t of THEMES) {
  const { border, borderStrong, panel, ink, pen } = t.tokens,
    need = NON_TEXT[t.target];
  if (contrast(border, panel) >= need) assert.strictEqual(borderStrong, border, `${t.id}: a border that reads is kept`);
  else assert.notStrictEqual(borderStrong, border, `${t.id}: a border that doesn't read is made stronger`);
  if (!t.id.startsWith('default')) assert.strictEqual(pen, ink, `${t.id}: the pen is the ink`);
}
// every colour but Snow has a kanban dot, written as --k-<colour>
for (const t of THEMES) {
  const butter = t.tokens.cards.butter;
  assert(butter, `${t.id}: has a Cloudberry card colour`);
  assert.deepStrictEqual(
    cardVars('butter', butter).filter(([n]) => n === '--k-butter'),
    [['--k-butter', butter.deep]],
    `${t.id}: Cloudberry has a kanban dot`,
  );
}

// the core colours reach the page from web/themes.css, which tests/themesCss.ts checks against this table; the one place
// two tables have to agree is the link on a dark Snow note, which is the accent tint
const dark = THEMES.find(t => t.id === 'default-dark')?.tokens;
assert.ok(dark, 'the dark Default theme is in the table');
assert.strictEqual(dark.accentTint, dark.cards.white?.link, 'a link on a dark Snow note matches the accent tint');

// an accent someone picked over a theme gets text that reads on it, or Settings is told it can't
for (const t of THEMES) {
  for (const accent of ['#c4502a', '#ffd400', '#2a6f4f', '#f0f0f0']) {
    const over = accentOver(t.tokens, t.target, accent);
    assert(
      !over.reads || contrast(over.onAccent, accent) >= TEXT[t.target],
      `${t.id}: text on ${accent} reads or is flagged`,
    );
    assert(
      contrast(over.accentText, t.tokens.panel) >= TEXT[t.target],
      `${t.id}: ${accent} as text reads on the panel`,
    );
  }
  assert(accentOver(t.tokens, t.target, t.tokens.accent).reads, `${t.id}: its own accent reads`);
}

console.log(`THEMES OK (${THEMES.length} themes)`);
