// Chrome drops the hue of a colour with chroma under about 0.02, and an oklch mix where neither side has a hue of its own
// paints pink: two greys, a grey and `transparent`, white and a warm brown. A mix with a saturated colour is fine, since the
// hue comes from that side. This finds every color-mix(in oklch, …) in the stylesheet and the derived colours, works out in
// the running app whether each side is hueless in every theme and mode, and fails when both are. The fix is to write it in
// oklab, which mixes the numbers as they are.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { THEMES } from '../src/web/settings/themes.ts';
import { isGrey } from '../src/web/ui/color.ts';
import { launch } from './support/launch.ts';
import { installPaint } from './support/paint.ts';

const root = path.resolve(import.meta.dirname, '..'),
  FILES = ['web/style.css', 'src/web/settings/derived.ts'];

// the two sides of each color-mix(in oklch, …), found by matching its brackets
function argsOfMixes(text: string) {
  const found: string[][] = [];
  for (const m of text.matchAll(/color-mix\(\s*in oklch\s*,/g)) {
    let depth = 1,
      i = (m.index ?? 0) + m[0].length,
      from = i;
    const args: string[] = [];
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 1) {
        args.push(text.slice(from, i));
        from = i + 1;
      }
    }
    args.push(text.slice(from, i - 1));
    found.push(args.map(a => a.trim()));
  }
  return found;
}

// a side is a variable's name, `transparent`, or something else (a literal colour, which has a hue to give)
type Side = { name: string } | 'transparent' | 'other';
const sideOf = (arg: string): Side => {
  const name = /^var\((--[\w-]+)\)/.exec(arg)?.[1];
  return name ? { name } : /^transparent\b/.test(arg) ? 'transparent' : 'other';
};
const mixes = FILES.flatMap(file =>
  argsOfMixes(fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).map(args => ({
    where: file,
    expr: `color-mix(in oklch, ${args.join(', ')})`,
    sides: args.map(sideOf),
  })),
);
assert(mixes.length > 0, 'the check found the mixes it is meant to look at');
const names = [...new Set(mixes.flatMap(m => m.sides.flatMap(s => (typeof s === 'object' ? [s.name] : []))))];

// the launcher waits for a card, so the board has one
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({ boards: [{ id: 'b', name: 'B', cards: [note], links: [], tray: [] }], open: 'b' });
await installPaint(app.page);

// the themes, by id, in which each variable has no hue of its own
const hueless = new Map<string, Set<string>>();
for (const t of THEMES) {
  const theme = t.id.replace(/-(light|dark)$/, ''),
    resolved = await app.page.evaluate(
      ([dark, cls, vars]) => {
        const b = document.body;
        b.classList.toggle('dark', dark === 'dark');
        for (const c of [...b.classList].filter(x => x.startsWith('theme-'))) b.classList.remove(c);
        if (cls) b.classList.add(cls);
        const out: Record<string, number[] | null> = {};
        for (const name of vars ?? []) {
          // a variable only an element defines (a card's own fill) isn't there on <body>, so there is nothing to look at
          if (!getComputedStyle(b).getPropertyValue(name).trim()) {
            out[name] = null;
            continue;
          }
          // under `run-tests.ts --lag` a colour change on a styled element is a transition that holds the old colour
          // for the delay, so each variable is read on a new element
          const probe = document.createElement('i');
          b.appendChild(probe);
          probe.style.color = `var(${name})`;
          out[name] = window.__paint(getComputedStyle(probe).color).slice(0, 3);
          probe.remove();
        }
        return out;
      },
      [t.mode, theme === 'default' ? '' : `theme-${theme}`, names] as const,
    );
  for (const [name, rgb] of Object.entries(resolved)) {
    if (!rgb) continue;
    const hex = `#${rgb.map(n => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
    if (isGrey(hex)) hueless.set(name, (hueless.get(name) ?? new Set()).add(t.id));
  }
}
await app.close();

// a mix is a problem in a theme when neither of its two sides has a hue there
const problems = mixes.flatMap(m => {
  if (m.sides.length !== 2 || m.sides.includes('other')) return [];
  const where = THEMES.filter(t =>
    m.sides.every(s => s === 'transparent' || (typeof s === 'object' && hueless.get(s.name)?.has(t.id))),
  ).map(t => t.id);
  return where.length
    ? [`${m.where}: neither side has a hue in ${where.join(', ')}, so mix it in oklab: ${m.expr}`]
    : [];
});
assert.deepStrictEqual([...new Set(problems)], [], 'no oklch mix has two sides without a hue');
console.log('GREY MIXES OK');
