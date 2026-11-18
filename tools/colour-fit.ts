// Finds out which colours in the stylesheet are the core tokens in disguise. Every pair of colours a rule shows in light
// and in dark mode (its token, and the token its body.dark rule swaps in) is matched against the core tokens in light
// and dark: one token, or a mix of two with color-mix(in oklch). A pair that matches within the tolerance in both modes
// can become that one expression, so no body.dark rule and no area token is needed for it.
//
//   node tools/colour-fit.ts --core core.json [--css web/style.css] [--prefix RE] [--tolerance 0.02] [--out report.json]
//
// core.json: { "--ink": ["#3b342d", "#f6f2ec"], ... }, each core token's light and dark value.
// --prefix limits the area tokens looked at by name (a regular expression, default every colour token).
// Prints a summary and the unmatched pairs that are used most; --out writes the whole report.
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
  fit: Fit | null;
  nearest: Fit | null;
};

const ROOT = path.resolve(import.meta.dirname, '..');
const DARK = /^body\.dark\s+/;
const STEPS = Array.from({ length: 23 }, (_, i) => (i + 1) * 4);

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
    out: '',
  };
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1] ?? '';
    if (args[i] === '--css') o.css = value;
    else if (args[i] === '--core') o.core = value;
    else if (args[i] === '--prefix') o.prefix = value;
    else if (args[i] === '--tolerance') o.tolerance = Number(value);
    else if (args[i] === '--out') o.out = value;
    else throw new Error(`Unknown option ${args[i]}`);
  }
  if (!o.core) throw new Error('--core is required');
  return o;
}

// the colour a token has in each mode: its :root value, and the one body.dark gives it, if any
function tokenValues(rules: [string, string][]) {
  const light = new Map<string, string>(),
    dark = new Map<string, string>();
  for (const [sel, body] of rules)
    for (const d of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*(?:;|$)/g)) {
      const name = d[1] ?? '',
        hex = (d[2] ?? '').toLowerCase();
      if (sel.trim() === 'body.dark') dark.set(name, hex);
      else if (!DARK.test(sel.trim())) light.set(name, hex);
    }
  return { light, dark };
}

const declsOf = (body: string) =>
  [...body.matchAll(/([^;:{}]+):([^;{}]*)/g)].map(
    d => [(d[1] ?? '').trim(), (d[2] ?? '').replace('!important', '').trim()] as const,
  );
const varsOf = (v: string) => [...v.matchAll(/var\((--[\w-]+)/g)].map(m => m[1] ?? '');
// two values pair up variable by variable when they are the same apart from which variables they name
const shape = (v: string) => v.replace(/var\(--[\w-]+\)/g, '@');

function groupsOf(css: string, prefix: RegExp, skip: Set<string>) {
  const blank = css.replace(/\/\*[\s\S]*?\*\//g, ''),
    rules = [...blank.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m): [string, string] => [m[1] ?? '', m[2] ?? '']),
    { light, dark } = tokenValues(rules),
    swaps = new Map<string, string>(),
    groups = new Map<string, Group>();
  const valueIn = (token: string, mode: Map<string, string>) => mode.get(token) ?? light.get(token);
  for (const [sel, body] of rules)
    for (const part of sel.split(',').map(p => p.trim()))
      if (DARK.test(part)) for (const [prop, v] of declsOf(body)) swaps.set(`${part.replace(DARK, '')}|${prop}`, v);
  let skipped = 0;
  for (const [sel, body] of rules)
    for (const part of sel.split(',').map(p => p.trim()))
      if (!DARK.test(part) && !part.startsWith(':root'))
        for (const [prop, v] of declsOf(body)) {
          if (prop.startsWith('--')) continue;
          const own = varsOf(v),
            swap = swaps.get(`${part}|${prop}`);
          if (!own.some(t => prefix.test(t) && !skip.has(t))) continue;
          if (swap !== undefined && shape(swap) !== shape(v)) {
            skipped++;
            continue;
          }
          const theirs = swap === undefined ? own : varsOf(swap);
          own.forEach((t, i) => {
            const d = theirs[i] ?? t,
              l = light.get(t),
              dv = valueIn(d, dark);
            if (!prefix.test(t) || skip.has(t) || !l || !dv) return;
            const key = `${l}|${dv}`,
              g = groups.get(key) ?? {
                light: l,
                dark: dv,
                tokens: [],
                uses: 0,
                fit: null,
                nearest: null,
              };
            g.uses++;
            for (const name of d === t ? [t] : [t, d]) if (!g.tokens.includes(name)) g.tokens.push(name);
            groups.set(key, g);
          });
        }
  return { groups: [...groups.values()], skipped };
}

function fit(g: Group, core: Map<string, Pair>, tolerance: number) {
  const names = [...core.keys()],
    miss = (a: Pair): Fit => ({
      expr: '',
      light: apart(a[0], g.light, 'typical'),
      dark: apart(a[1], g.dark, 'typical'),
    }),
    worst = (f: Fit) => Math.max(f.light, f.dark);
  let nearest: Fit | null = null,
    single: Fit | null = null;
  const take = (f: Fit) => {
    if (!nearest || worst(f) < worst(nearest)) nearest = f;
  };
  for (const a of names) {
    const f = { ...miss(core.get(a) ?? ['', '']), expr: `var(${a})` };
    take(f);
    if (worst(f) <= tolerance && (!single || worst(f) < worst(single))) single = f;
  }
  if (single) return { fit: single, nearest: single };
  for (const a of names)
    for (const b of names)
      if (a < b)
        for (const p of STEPS) {
          const [al, ad] = core.get(a) ?? ['', ''],
            [bl, bd] = core.get(b) ?? ['', ''],
            k = 1 - p / 100,
            f = {
              ...miss([mixOklch(al, bl, k), mixOklch(ad, bd, k)]),
              expr: `color-mix(in oklch, var(${a}) ${p}%, var(${b}))`,
            };
          take(f);
        }
  const best: Fit | null = nearest;
  return { fit: best && worst(best) <= tolerance ? best : null, nearest: best };
}

const opts = parseArgs(process.argv.slice(2)),
  core = readCore(opts.core),
  { groups, skipped } = groupsOf(fs.readFileSync(opts.css, 'utf8'), new RegExp(opts.prefix), new Set(core.keys()));
for (const g of groups) Object.assign(g, fit(g, core, opts.tolerance));
const fitted = groups.filter(g => g.fit),
  left = groups.filter(g => !g.fit).sort((a, b) => b.uses - a.uses),
  sum = (gs: Group[]) => gs.reduce((n, g) => n + g.uses, 0);
console.log(
  JSON.stringify({
    pairs: groups.length,
    fitted: fitted.length,
    unmatched: left.length,
    usesFitted: sum(fitted),
    usesUnmatched: sum(left),
    skippedComplex: skipped,
  }),
);
for (const g of left.slice(0, 25))
  console.log(
    `${String(g.uses).padStart(3)}  ${g.light} / ${g.dark}  ${g.tokens.join(' ')}  nearest ${g.nearest?.expr} (${g.nearest?.light.toFixed(3)}, ${g.nearest?.dark.toFixed(3)})`,
  );
if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(groups, null, 1));
