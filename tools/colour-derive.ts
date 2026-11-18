// Turns area colours into expressions of the core tokens, so every use of one follows the theme. Where colour-fit.ts
// rewrites the places a colour is used, this rewrites what it is: a token defined as #ece6e0 becomes
// color-mix(in oklab, var(--ink) 8%, var(--surface)), and a theme that changes --ink or --surface changes it too.
//
//   node tools/colour-derive.ts --core tools/colour-core.json [--tolerance 0.02] [--apply] [--pairs pairs.json]
//                               [--css web/style.css] [--themes web/themes.css] [--table src/web/settings/derived.ts]
//                               [--source src/web]
//
// Only the mode a token is used in has to match: a token used in light rules alone is fitted in light, one used in
// dark rules alone in dark, and one used in both in both. A token nothing uses is removed. Tokens used by the html
// element (which can't see what is defined on body), set by the renderer, or defined again in some part of the page are
// left alone, and so is any token that doesn't fit; they are listed.
// --apply writes the expressions into src/web/settings/derived.ts and removes the old definitions from web/style.css.
// --pairs writes [property, old light value, new value, old dark value, mode] for tools/colour-compare.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fit, isDark, parseRules, type Rule } from './colour-survey.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2),
  opt = (name: string) => (args.includes(name) ? (args[args.indexOf(name) + 1] ?? '') : '');
const coreFile = opt('--core'),
  tolerance = Number(opt('--tolerance') || 0.02),
  apply = args.includes('--apply'),
  pairsFile = opt('--pairs');
const cssFile = opt('--css') || path.join(ROOT, 'web/style.css'),
  themesFile = opt('--themes') || path.join(ROOT, 'web/themes.css'),
  DERIVED = opt('--table') || path.join(ROOT, 'src/web/settings/derived.ts'),
  sourceDir = opt('--source') || path.join(ROOT, 'src/web');
if (!coreFile) throw new Error('--core is required');

const core = new Map<string, [string, string]>(),
  parsed: unknown = JSON.parse(fs.readFileSync(coreFile, 'utf8'));
if (typeof parsed !== 'object' || parsed === null) throw new Error(`${coreFile} must hold an object`);
for (const name of Object.keys(parsed)) {
  const pair: unknown = Reflect.get(parsed, name);
  if (!Array.isArray(pair) || typeof pair[0] !== 'string' || typeof pair[1] !== 'string')
    throw new Error(`${name} needs [light hex, dark hex]`);
  core.set(name, [pair[0], pair[1]]);
}
// themes.css is where the core tokens are defined now, so the ones the tool wasn't told about are read from there: the
// :root block is their light value and the body.dark block their dark one
const themes = fs.readFileSync(themesFile, 'utf8'),
  blockOf = (sel: string) => new RegExp(`^${sel.replace('.', '\\.')} \\{([^}]*)\\}`, 'm').exec(themes)?.[1] ?? '',
  valuesIn = (block: string) =>
    new Map([...block.matchAll(/(--[\w-]+): (#[0-9a-f]{6});/g)].map(m => [m[1] ?? '', m[2] ?? ''])),
  lightCore = valuesIn(blockOf(':root')),
  darkCore = valuesIn(blockOf('body.dark'));
for (const [name, l] of lightCore) if (!core.has(name)) core.set(name, [l, darkCore.get(name) ?? l]);

const css = fs.readFileSync(cssFile, 'utf8'),
  rules: Rule[] = parseRules(css),
  light = new Map<string, string>(),
  dark = new Map<string, string>(),
  scoped = new Set<string>(),
  usedLight = new Set<string>(),
  usedDark = new Set<string>(),
  onHtml = new Set<string>();
for (const r of rules)
  for (const d of r.decls) {
    if (d.prop.startsWith('--')) {
      const sel = r.parts.length === 1 ? r.parts[0] : '',
        hex = /^#[0-9a-f]{6}$/i.test(d.value);
      if (sel === ':root' && hex) light.set(d.prop, d.value.toLowerCase());
      else if (sel === 'body.dark' && hex) dark.set(d.prop, d.value.toLowerCase());
      else if (sel !== ':root' && sel !== 'body.dark') scoped.add(d.prop);
    }
    for (const m of d.value.matchAll(/var\((--[\w-]+)/g)) {
      const t = m[1] ?? '';
      (isDark(r) ? usedDark : usedLight).add(t);
      if (r.parts.some(p => /^(html|:root)\b/.test(p))) onHtml.add(t);
    }
  }

// what the renderer sets by name, and the families it builds the name of
const source = (function walk(p: string): string {
  return fs.statSync(p).isDirectory()
    ? fs
        .readdirSync(p)
        .map(f => walk(path.join(p, f)))
        .join('\n')
    : /\.(ts|html)$/.test(p) && p !== DERIVED
      ? fs.readFileSync(p, 'utf8')
      : '';
})(sourceDir);
const setByRenderer = new Set([...source.matchAll(/setProperty\(\s*['"`](--[\w-]+)['"`]/g)].map(m => m[1] ?? '')),
  families = [...source.matchAll(/(--[a-z0-9]+(?:-[a-z0-9]+)*-)(?:\$\{|['"`]\s*\+)/g)].map(m => m[1] ?? ''),
  // an array of names the renderer sets in a loop, such as ['--pink-deep', '--pink'].forEach(removeProperty)
  named = (t: string) => source.includes(`'${t}'`) || source.includes(`"${t}"`);

const derived: Record<string, string> = {},
  kept: Record<string, string> = {},
  pairs: string[][] = [],
  unfit: string[] = [],
  left: string[] = [],
  unused: string[] = [];
for (const [t, l] of [...light].sort()) {
  if (core.has(t) || scoped.has(t)) continue;
  if (onHtml.has(t) || setByRenderer.has(t) || named(t) || families.some(f => t.startsWith(f))) {
    left.push(t);
    continue;
  }
  const d = dark.get(t) ?? l,
    inLight = usedLight.has(t),
    inDark = usedDark.has(t);
  if (!inLight && !inDark) {
    unused.push(t);
    continue;
  }
  const only: 'light' | 'dark' | undefined = inLight && !inDark ? 'light' : inDark && !inLight ? 'dark' : undefined,
    g = { light: l, dark: d, only, tokens: [t], uses: 0, allowed: false, fit: null, nearest: null },
    found = fit(g, core, tolerance).fit;
  if (!found) {
    unfit.push(`${t} ${l}${d === l ? '' : ` / ${d}`}`);
    continue;
  }
  // a token used in light rules alone is still on screen in dark mode wherever no dark rule beats it; if the mix would
  // change how it looks there, dark mode keeps the old colour until someone has looked at that place
  const keepsDark = only === 'light' && found.dark > tolerance;
  derived[t] = found.expr;
  if (keepsDark) kept[t] = d;
  pairs.push(['background-color', l, `var(${t})`, d, keepsDark ? 'both' : (only ?? 'both')]);
}
console.log(
  JSON.stringify({
    derived: Object.keys(derived).length,
    unused: unused.length,
    unfit: unfit.length,
    left: left.length,
  }),
);
console.log(`left alone (html, renderer): ${left.join(' ')}`);
console.log(`no fit: ${unfit.join(', ')}`);

if (pairsFile) fs.writeFileSync(pairsFile, JSON.stringify(pairs));

if (apply) {
  const lines = Object.entries(derived)
      .map(([t, e]) => (kept[t] ? `  '${t}': ['${e}', '${kept[t]}'],` : `  '${t}': '${e}',`))
      .join('\n'),
    note =
      '// Area colours written as mixes of the core tokens, so a theme that sets the core ones sets these too.\n' +
      "// tools/themes-css.ts writes them into web/themes.css as one block on <body>, where the theme's variables apply.\n" +
      '// Seeded by tools/colour-derive.ts; change an expression here, not in the CSS.\n';
  fs.writeFileSync(
    DERIVED,
    `${note}export const DERIVED: Record<string, string | [light: string, dark: string]> = {\n${lines}\n};\n`,
  );
  const gone = new Set([...Object.keys(derived), ...unused]),
    defs = [...gone].map(t => new RegExp(`(?<![\\w-])${t}: *#[0-9a-fA-F]{6}; ?`));
  const out = css
    .split('\n')
    .flatMap(line => {
      if (!defs.some(d => d.test(line))) return [line];
      const rest = defs.reduce((l, d) => l.replace(d, ''), line);
      return rest.trim() === '' ? [] : [rest.replace(/[ \t]+$/, '')];
    })
    .join('\n')
    .replace(/(?:\/\*[^\n]*\*\/\n)?(?::root|body\.dark) \{\s*\}\n/g, '');
  fs.writeFileSync(cssFile, out);
}
