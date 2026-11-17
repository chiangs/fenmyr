// Moves raw colours in a stylesheet onto variables, without changing any colour. Each hex or rgb()/rgba() value in a
// declaration that isn't a custom property becomes var(--token), or rgb(from var(--token) r g b / alpha) when it has
// an alpha, using the token you give for that colour. Prove the result with tools/colour-compare.ts.
//
//   node tools/colour-convert.ts --map map.json [--css web/style.css] [--include RE] [--exclude RE]
//                                [--pairs pairs.json] [--dry]
//
// map.json: { "#ffffff": ["--snow", "--hilite"], "#3b342d": "--ink" }. A pair is [background token, any other
// property's token], for a colour that means a surface in one place and a highlight in another. Keys are lower-case
// 6-digit hex. A colour with no entry is left alone and listed under "missing".
// --include / --exclude are regular expressions tested against each rule's selector; a rule is converted when it
// matches --include (default: every rule) and not --exclude.
// --pairs writes [property, old value, new value] for every change, which tools/colour-compare.ts reads.
// --dry changes nothing in the stylesheet.
// Prints { edits, used, missing } as JSON. Run it again and it finds nothing to do.
import fs from 'node:fs';
import path from 'node:path';

type Token = string | [string, string];
type Edit = { start: number; end: number; value: string };

const ROOT = path.resolve(import.meta.dirname, '..');
// a rule whose rgba(r, g, b), a) was mangled is invalid CSS the browser drops, so converting it would change nothing
const BROKEN = /rgba?\([0-9 ,.]+\),\s*[0-9.]+\)/;
const RGBA = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/g;
const HEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const HEX_WITH_ALPHA = /#(?:[0-9a-fA-F]{4}|[0-9a-fA-F]{8})\b/g;

function readMap(file: string) {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${file} must hold an object`);
  const map = new Map<string, Token>();
  for (const hex of Object.keys(raw)) {
    const token: unknown = Reflect.get(raw, hex),
      [first, second] = Array.isArray(token) ? token : [];
    if (typeof token === 'string') map.set(hex.toLowerCase(), token);
    else if (typeof first === 'string' && typeof second === 'string' && Array.isArray(token) && token.length === 2)
      map.set(hex.toLowerCase(), [first, second]);
    else throw new Error(`${hex} needs a token name or a [background, other] pair`);
  }
  return map;
}

const full = (hex: string) =>
  hex.length === 4 ? `#${[...hex.slice(1)].map(c => c + c).join('')}`.toLowerCase() : hex.toLowerCase();

function parseArgs(args: string[]) {
  let css = path.join(ROOT, 'web/style.css'),
    map = '',
    include = '.',
    exclude = '(?!)',
    pairs = '',
    dry = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i],
      value = args[i + 1] ?? '';
    if (flag === '--dry') dry = true;
    else if (flag === '--css') css = value;
    else if (flag === '--map') map = value;
    else if (flag === '--include') include = value;
    else if (flag === '--exclude') exclude = value;
    else if (flag === '--pairs') pairs = value;
    else throw new Error(`Unknown option ${flag}`);
    if (flag !== '--dry') i++;
  }
  if (!map) throw new Error('--map is required');
  return { css, map, include, exclude, pairs, dry };
}

function convert(css: string, map: Map<string, Token>, include: RegExp, exclude: RegExp) {
  // comments are blanked, keeping their length, so their text is never read as a colour
  const blank = css.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' ')),
    edits: Edit[] = [],
    pairs: [string, string, string][] = [],
    used = new Set<string>(),
    missing = new Set<string>();
  for (const rule of blank.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1] ?? '';
    if (!include.test(selector) || exclude.test(selector)) continue;
    const bodyStart = (rule.index ?? 0) + selector.length + 1;
    for (const decl of (rule[2] ?? '').matchAll(/([^;:]+):([^;]*)/g)) {
      const prop = (decl[1] ?? '').trim(),
        old = decl[2] ?? '';
      if (prop.startsWith('--') || BROKEN.test(old)) continue;
      const surface = prop.startsWith('background'),
        pick = (hex: string, onSurface: boolean) => {
          const token = map.get(hex),
            name = Array.isArray(token) ? token[onSurface ? 0 : 1] : token;
          if (name) used.add(name);
          else missing.add(hex);
          return name;
        };
      let value = old.replace(RGBA, (whole, r: string, g: string, b: string, a: string | undefined) => {
        const hex = `#${[r, g, b].map(n => Math.round(Number(n)).toString(16).padStart(2, '0')).join('')}`,
          name = pick(hex, false);
        if (!name) return whole;
        return a === undefined || Number(a) === 1 ? `var(${name})` : `rgb(from var(${name}) r g b / ${a})`;
      });
      value = value.replace(HEX, found => {
        const name = pick(full(found), surface);
        return name ? `var(${name})` : found;
      });
      for (const f of old.match(HEX_WITH_ALPHA) ?? []) missing.add(f.toLowerCase());
      if (value === old) continue;
      const start = bodyStart + (decl.index ?? 0) + (decl[1] ?? '').length + 1;
      edits.push({ start, end: start + old.length, value });
      pairs.push([prop, old.replace('!important', '').trim(), value.replace('!important', '').trim()]);
    }
  }
  let out = css;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.value + out.slice(e.end);
  return { out, edits: edits.length, pairs, used: [...used].sort(), missing: [...missing].sort() };
}

const opts = parseArgs(process.argv.slice(2)),
  result = convert(
    fs.readFileSync(opts.css, 'utf8'),
    readMap(opts.map),
    new RegExp(opts.include),
    new RegExp(opts.exclude),
  );
if (!opts.dry) fs.writeFileSync(opts.css, result.out);
if (opts.pairs) fs.writeFileSync(opts.pairs, JSON.stringify(result.pairs));
console.log(JSON.stringify({ edits: result.edits, used: result.used, missing: result.missing }));
