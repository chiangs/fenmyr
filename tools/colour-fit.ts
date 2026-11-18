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
import { rewrite } from './colour-rewrite.ts';
import { fit, type Group, type Pair, parseRules, survey } from './colour-survey.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

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

if (opts.apply || opts.pairs) {
  const done = rewrite(css, rules, found, core);
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
