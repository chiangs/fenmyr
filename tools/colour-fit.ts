// Finds out which colours in the stylesheet are the core tokens in disguise. Every pair of colours a rule shows in light
// and in dark mode (its token, and the token its body.dark rule swaps in) is matched against the core tokens in light
// and dark: one token, or a mix of two with color-mix(in oklch). A pair that matches within the tolerance in both modes
// can become that one expression, so no body.dark rule and no area token is needed for it.
//
//   node tools/colour-fit.ts --core core.json [--css web/style.css] [--prefix RE] [--tolerance 0.02]
//                            [--allow TOKEN,TOKEN] [--apply] [--pairs pairs.json] [--out report.json]
//
// core.json: { "--ink": ["#3b342d", "#f6f2ec"], ... }, each core token's light and dark value.
// --prefix limits the area tokens looked at by name (a regular expression, default every colour token).
// --allow names tokens that may move up to 0.06 instead, for a merge someone has agreed to look at.
// --apply rewrites the stylesheet: each matched use takes its expression, the body.dark declarations it made redundant
// go, a core token the stylesheet doesn't define yet is defined, and an area token nothing uses any more is removed.
// --pairs writes [property, old light value, new value, old dark value] for each rewritten declaration, which
// tools/colour-compare.ts --tolerance reads. Without --apply it only reports what would fit and what doesn't.
import fs from 'node:fs';
import path from 'node:path';
import { apart, mixOklch } from '../src/web/ui/color.ts';

type Pair = [light: string, dark: string];
type Fit = { expr: string; light: number; dark: number };
type Group = {
  light: string;
  dark: string;
  tokens: string[];
  uses: number;
  allowed: boolean;
  fit: Fit | null;
  nearest: Fit | null;
};
type Decl = { prop: string; value: string; propStart: number; valueStart: number; end: number };
type Rule = { parts: string[]; start: number; end: number; decls: Decl[] };
type Use = {
  rule: number;
  decl: number;
  keys: string[];
  slots: (Group | null)[];
  keysOfParts: string[];
  was: [string, string];
};

const ROOT = path.resolve(import.meta.dirname, '..');
const DARK = /^body\.dark\s+/;
const ALLOWED = 0.06;
const STEPS = Array.from({ length: 23 }, (_, i) => (i + 1) * 4);
const varsOf = (v: string) => [...v.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1] ?? '');
// two values pair up variable by variable when they are the same apart from which variables they name
const shape = (v: string) => v.replace(/var\(--[\w-]+\)/g, '@');
const isDark = (r: Rule) => r.parts.every(p => DARK.test(p));
const FALLBACK = /var\(--[\w-]+\s*,/;

function readCore(file: string) {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${file} must hold an object`);
  const core = new Map<string, Pair>();
  for (const name of Object.keys(raw)) {
    const pair: unknown = Reflect.get(raw, name);
    if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string')
      throw new Error(`${name} needs [light hex, dark hex]`);
    core.set(name, [pair[0].toLowerCase(), pair[1].toLowerCase()]);
  }
  return core;
}

function parseArgs(args: string[]) {
  const o = {
    css: path.join(ROOT, 'web/style.css'),
    core: '',
    prefix: '.',
    tolerance: 0.02,
    allow: new Set<string>(),
    apply: false,
    pairs: '',
    out: '',
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i],
      value = args[i + 1] ?? '';
    if (flag === '--apply') o.apply = true;
    else if (flag === '--css') o.css = value;
    else if (flag === '--core') o.core = value;
    else if (flag === '--prefix') o.prefix = value;
    else if (flag === '--tolerance') o.tolerance = Number(value);
    else if (flag === '--allow') for (const t of value.split(',')) o.allow.add(t.trim());
    else if (flag === '--pairs') o.pairs = value;
    else if (flag === '--out') o.out = value;
    else throw new Error(`Unknown option ${flag}`);
    if (flag !== '--apply') i++;
  }
  if (!o.core) throw new Error('--core is required');
  return o;
}

function parseRules(css: string) {
  const blank = css.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  return [...blank.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m): Rule => {
    const selector = m[1] ?? '',
      bodyStart = (m.index ?? 0) + selector.length + 1;
    return {
      parts: selector.split(',').map(p => p.trim()),
      start: (m.index ?? 0) + (selector.length - selector.trimStart().length),
      end: bodyStart + (m[2] ?? '').length + 1,
      decls: [...(m[2] ?? '').matchAll(/([^;:{}]+):([^;{}]*)/g)].map(d => ({
        prop: (d[1] ?? '').trim(),
        value: (d[2] ?? '').replace('!important', '').trim(),
        propStart: bodyStart + (d.index ?? 0) + ((d[1] ?? '').length - (d[1] ?? '').trimStart().length),
        valueStart: bodyStart + (d.index ?? 0) + (d[1] ?? '').length + 1,
        end: bodyStart + (d.index ?? 0) + (d[0] ?? '').length,
      })),
    };
  });
}

// the colour a token has in each mode: its :root value, and the one body.dark gives it, if any
function tokenValues(rules: Rule[]) {
  const light = new Map<string, string>(),
    dark = new Map<string, string>();
  for (const r of rules)
    for (const d of r.decls) {
      if (!d.prop.startsWith('--') || !/^#[0-9a-fA-F]{6}$/.test(d.value)) continue;
      if (r.parts.length === 1 && r.parts[0] === 'body.dark') dark.set(d.prop, d.value.toLowerCase());
      else if (!isDark(r)) light.set(d.prop, d.value.toLowerCase());
    }
  return { light, dark };
}

function fit(g: Group, core: Map<string, Pair>, tolerance: number) {
  const names = [...core.keys()],
    seen = (a: Pair, expr: string): Fit => ({
      expr,
      light: apart(a[0], g.light, 'typical'),
      dark: apart(a[1], g.dark, 'typical'),
    }),
    worst = (f: Fit) => Math.max(f.light, f.dark),
    limit = g.allowed ? ALLOWED : tolerance;
  let nearest: Fit | null = null,
    single: Fit | null = null;
  const take = (f: Fit) => {
    if (!nearest || worst(f) < worst(nearest)) nearest = f;
  };
  for (const a of names) {
    const f = seen(core.get(a) ?? ['', ''], `var(${a})`);
    take(f);
    if (worst(f) <= limit && (!single || worst(f) < worst(single))) single = f;
  }
  if (single) return { fit: single, nearest: single };
  // a mix of two colours that never change is a constant too, so it would never follow a theme
  const varies = (n: string) => core.get(n)?.[0] !== core.get(n)?.[1];
  for (const a of names)
    for (const b of names)
      if (a < b && (varies(a) || varies(b)))
        for (const p of STEPS) {
          const [al, ad] = core.get(a) ?? ['', ''],
            [bl, bd] = core.get(b) ?? ['', ''],
            k = 1 - p / 100;
          take(seen([mixOklch(al, bl, k), mixOklch(ad, bd, k)], `color-mix(in oklch, var(${a}) ${p}%, var(${b}))`));
        }
  const best: Fit | null = nearest;
  return { fit: best && worst(best) <= limit ? best : null, nearest: best };
}

function survey(rules: Rule[], prefix: RegExp, skip: Set<string>, allow: Set<string>) {
  const { light, dark } = tokenValues(rules),
    swaps = new Map<string, { value: string; rule: number }>(),
    groups = new Map<string, Group>(),
    uses: Use[] = [],
    valueIn = (token: string) => dark.get(token) ?? light.get(token),
    aimed = (t: string) => prefix.test(t) && !skip.has(t);
  let skipped = 0;
  const family = (prop: string) => prop.split('-')[0] ?? prop,
    darkProps = new Set<string>();
  rules.forEach((r, rule) => {
    if (isDark(r))
      for (const p of r.parts)
        for (const d of r.decls) {
          swaps.set(`${p.replace(DARK, '')}|${d.prop}`, { value: d.value, rule });
          darkProps.add(`${p.replace(DARK, '')}|${family(d.prop)}`);
        }
  });
  rules.forEach((r, rule) => {
    if (isDark(r) || r.parts.some(p => DARK.test(p) || p.startsWith(':root'))) return;
    r.decls.forEach((d, decl) => {
      const own = varsOf(d.value);
      if (d.prop.startsWith('--') || !own.some(aimed)) return;
      // a pair per variable in the value, the same for every selector in the rule; if they differ it can't be one expression
      const per = r.parts.map(part => {
        const swap = swaps.get(`${part}|${d.prop}`);
        // body.dark sets border-color where this sets border: one colour in light, another in dark, and no way to pair them
        if (!swap && darkProps.has(`${part}|${family(d.prop)}`)) return null;
        if (swap && (shape(swap.value) !== shape(d.value) || FALLBACK.test(swap.value))) return null;
        const theirs = swap ? varsOf(swap.value) : own;
        return own.map((t, i) => [light.get(t), valueIn(theirs[i] ?? t), theirs[i] ?? t] as const);
      });
      const first = per[0];
      if (!first || per.some(p => !p || JSON.stringify(p) !== JSON.stringify(first)) || FALLBACK.test(d.value)) {
        skipped++;
        return;
      }
      const slots = own.map((t, i) => {
        const [l, dv, swapped] = first[i] ?? [];
        if (!aimed(t) || !l || !dv) return null;
        const key = `${l}|${dv}`,
          g = groups.get(key) ?? { light: l, dark: dv, tokens: [], uses: 0, allowed: false, fit: null, nearest: null };
        g.uses++;
        g.allowed ||= allow.has(t);
        for (const name of swapped === t ? [t] : [t, swapped ?? t]) if (!g.tokens.includes(name)) g.tokens.push(name);
        groups.set(key, g);
        return g;
      });
      uses.push({
        rule,
        decl,
        keys: r.parts.map(part => `${part}|${d.prop}`),
        slots,
        keysOfParts: r.parts,
        was: [d.value, d.value],
      });
    });
  });
  return { groups: [...groups.values()], uses, skipped, light, dark, swaps };
}

const opts = parseArgs(process.argv.slice(2)),
  core = readCore(opts.core),
  css = fs.readFileSync(opts.css, 'utf8'),
  rules = parseRules(css),
  found = survey(rules, new RegExp(opts.prefix), new Set(core.keys()), opts.allow);
for (const g of found.groups) Object.assign(g, fit(g, core, opts.tolerance));
const fitted = found.groups.filter(g => g.fit),
  left = found.groups.filter(g => !g.fit).sort((a, b) => b.uses - a.uses),
  sum = (gs: Group[]) => gs.reduce((n, g) => n + g.uses, 0);
console.log(
  JSON.stringify({
    pairs: found.groups.length,
    fitted: fitted.length,
    unmatched: left.length,
    usesFitted: sum(fitted),
    usesUnmatched: sum(left),
    skippedComplex: found.skipped,
  }),
);
for (const g of left.slice(0, 25))
  console.log(
    `${String(g.uses).padStart(3)}  ${g.light} / ${g.dark}  ${g.tokens.join(' ')}  nearest ${g.nearest?.expr} (${g.nearest?.light.toFixed(3)}, ${g.nearest?.dark.toFixed(3)})`,
  );

type Edit = { start: number; end: number; text: string };

// area tokens nothing refers to any more, outside the stylesheet too (the renderer sets and reads some by name)
function referencedElsewhere(name: string) {
  const dirs = [path.join(ROOT, 'src/web'), path.join(ROOT, 'web/index.html')];
  const walk = (p: string): string[] =>
    fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap(f => walk(path.join(p, f))) : [p];
  return dirs.flatMap(walk).some(f => /\.(ts|html)$/.test(f) && fs.readFileSync(f, 'utf8').includes(name));
}

// a rule alone on its line takes the line with it; one sharing a line leaves the others where they were
function wholeRule(r: Rule): Edit {
  let end = r.end,
    before = r.start;
  while (css[end] === ' ' || css[end] === '\t') end++;
  while (css[before - 1] === ' ' || css[before - 1] === '\t') before--;
  const alone = before === 0 || css[before - 1] === '\n';
  if (alone) return { start: r.start, end: css[end] === '\n' ? end + 1 : end, text: '' };
  return { start: before, end: r.end, text: '' };
}

function rewrite() {
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
    const gone = r.decls.filter(d => r.parts.every(p => applied.has(`${p.replace(DARK, '')}|${d.prop}`)));
    if (!gone.length) return;
    dropped += gone.length;
    if (gone.length === r.decls.length) {
      emptied++;
      edits.push(wholeRule(r));
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

if (opts.apply || opts.pairs) {
  const done = rewrite();
  if (opts.apply) fs.writeFileSync(opts.css, done.out);
  if (opts.pairs) fs.writeFileSync(opts.pairs, JSON.stringify(done.pairs));
  console.log(
    JSON.stringify({
      rewritten: done.rewritten,
      darkDeclarationsDropped: done.dropped,
      darkRulesRemoved: done.emptied,
      tokensRemoved: done.removed.length,
    }),
  );
}
if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(found.groups, null, 1));
