// Rewrites the stylesheet from what colour-fit.ts found: each matched use takes its expression, the body.dark declarations
// that made redundant go (unless another rule for the same element would then win in dark mode), a core token the
// stylesheet doesn't define yet is defined, and an area token nothing uses any more is removed.
import fs from 'node:fs';
import path from 'node:path';
import { DARK, type Decl, isDark, type Pair, type Rule, type survey } from './colour-survey.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
type Edit = { start: number; end: number; text: string };

// the renderer names some tokens as it goes, var(--card-${key}), so a whole family is kept when its prefix is built
function sourceText() {
  const walk = (p: string): string[] =>
    fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap(f => walk(path.join(p, f))) : [p];
  return [path.join(ROOT, 'src/web'), path.join(ROOT, 'web/index.html')]
    .flatMap(walk)
    .filter(f => /\.(ts|html)$/.test(f))
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n');
}
const SOURCE = sourceText();
const FAMILIES = [...SOURCE.matchAll(/(--[a-z0-9]+(?:-[a-z0-9]+)*-)(?:\$\{|['"`]\s*\+)/g)].map(m => m[1] ?? '');
const referencedElsewhere = (name: string) => SOURCE.includes(name) || FAMILIES.some(f => name.startsWith(f));

// which element a selector's last part styles: its classes, ids and tag, and the pseudo-element if any
function target(part: string) {
  const bare = part.replace(DARK, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ''),
    last =
      bare
        .split(/[\s>+~]+/)
        .filter(Boolean)
        .pop() ?? '';
  return {
    element: /::[\w-]+/.exec(last)?.[0] ?? '',
    names: [
      ...last
        .replace(/::[\w-]+/g, '')
        .replace(/:[\w-]+/g, '')
        .matchAll(/[.#][\w-]+|^[a-z][\w-]*/g),
    ].map(m => m[0]),
  };
}

// The body.dark rule beats the light one by being more specific. Another rule for the same element that sets the same
// kind of property would have been held back by it too, and would win in dark mode once it was gone.
function contested(rules: Rule[], dark: Rule, d: Decl) {
  const family = d.prop.split('-')[0],
    base = dark.parts.map(p => p.replace(DARK, ''));
  const twice = base.some(
    b => rules.filter(r => !isDark(r) && r.parts.includes(b) && r.decls.some(x => x.prop === d.prop)).length > 1,
  );
  if (twice) return true;
  return dark.parts.some(part => {
    const mine = target(part),
      same = (r: Rule) => r.parts.every(p => base.includes(p.replace(DARK, '')));
    return rules.some(
      r =>
        !same(r) &&
        r.decls.some(x => x.prop.split('-')[0] === family) &&
        r.parts.some(q => {
          const theirs = target(q);
          return (
            theirs.element === mine.element && (!theirs.names.length || theirs.names.some(n => mine.names.includes(n)))
          );
        }),
    );
  });
}

// a rule alone on its line takes the line with it; one sharing a line leaves the others where they were
function wholeRule(css: string, r: Rule): Edit {
  let end = r.end,
    before = r.start;
  while (css[end] === ' ' || css[end] === '\t') end++;
  while (css[before - 1] === ' ' || css[before - 1] === '\t') before--;
  const alone = before === 0 || css[before - 1] === '\n';
  if (alone) return { start: r.start, end: css[end] === '\n' ? end + 1 : end, text: '' };
  return { start: before, end: r.end, text: '' };
}

export function rewrite(css: string, rules: Rule[], found: ReturnType<typeof survey>, core: Map<string, Pair>) {
  const { light, dark, swaps, uses } = found,
    literal = (value: string, mode: Map<string, string>) =>
      value.replace(/var\((--[\w-]+)\)/g, (m, t: string) => mode.get(t) ?? light.get(t) ?? m),
    edits: Edit[] = [],
    pairs: string[][] = [],
    applied = new Set<string>(),
    usedCore = new Set<string>(),
    changed = new Set<string>();
  for (const u of uses) {
    if (!u.slots.some(Boolean) || !u.slots.every(g => g === null || g.fit)) continue;
    const d = rules[u.rule]?.decls[u.decl],
      r = rules[u.rule];
    if (!d || !r) continue;
    let i = 0;
    const raw = css.slice(d.valueStart, d.end),
      text = raw.replace(/var\(--[\w-]+\)/g, m => {
        const g = u.slots[i++];
        return g?.fit ? g.fit.expr : m;
      }),
      swap = swaps.get(u.keys[0] ?? ''),
      clean = (v: string) => v.replace('!important', '').trim();
    edits.push({ start: d.valueStart, end: d.end, text });
    pairs.push([d.prop, clean(literal(raw, light)), clean(text), clean(literal(swap ? swap.value : raw, dark))]);
    for (const k of u.keys) applied.add(k);
    for (const m of text.matchAll(/var\((--[\w-]+)\)/g)) if (core.has(m[1] ?? '')) usedCore.add(m[1] ?? '');
    for (const g of u.slots) for (const t of g?.tokens ?? []) changed.add(t);
  }
  let dropped = 0,
    emptied = 0;
  rules.forEach(r => {
    if (!isDark(r)) return;
    const gone = r.decls.filter(
      d => r.parts.every(p => applied.has(`${p.replace(DARK, '')}|${d.prop}`)) && !contested(rules, r, d),
    );
    if (!gone.length) return;
    dropped += gone.length;
    if (gone.length === r.decls.length) {
      emptied++;
      edits.push(wholeRule(css, r));
    } else
      for (const d of gone) {
        const end = d.end + (css[d.end] === ';' ? 1 : 0);
        edits.push({ start: d.propStart, end: end + (css[end] === ' ' ? 1 : 0), text: '' });
      }
  });
  let out = css;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const define: string[] = [],
    defineDark: string[] = [];
  for (const t of [...usedCore].sort()) {
    const [l, dk] = core.get(t) ?? ['', ''];
    if (!light.has(t)) define.push(`${t}: ${l};`);
    else if (light.get(t) !== l) console.log(`warning: ${t} is ${light.get(t)} in the stylesheet, ${l} in core.json`);
    if ((dark.get(t) ?? light.get(t) ?? l) !== dk) defineDark.push(`${t}: ${dk};`);
  }
  if (define.length || defineDark.length)
    out =
      `${out.trimEnd()}\n\n/* core colours the rest of the stylesheet is made from; #251 gives each theme its own values */\n:root { ${define.join(' ')} }\nbody.dark { ${defineDark.join(' ')} }\n`.replace(
        /\n(:root|body\.dark) \{ \}/g,
        '',
      );
  // an area token goes when nothing refers to it any more, in the stylesheet or in the renderer
  const removed = [...changed]
    .sort()
    .filter(t => !core.has(t) && !out.includes(`var(${t})`) && !out.includes(`var(${t},`) && !referencedElsewhere(t));
  const defs = removed.map(t => new RegExp(`${t}: *#[0-9a-fA-F]{6}; ?`));
  out = out
    .split('\n')
    .flatMap(line => {
      if (!defs.some(d => d.test(line))) return [line];
      const left = defs.reduce((l, d) => l.replace(d, ''), line);
      return left.trim() === '' ? [] : [left.replace(/[ \t]+$/, '')];
    })
    .join('\n')
    // a block left with nothing in it goes, with the comment above it
    .replace(/(?:\/\*[^\n]*\*\/\n)?(?::root|body\.dark) \{\s*\}\n/g, '');
  return { out, pairs, dropped, emptied, removed, rewritten: pairs.length };
}
