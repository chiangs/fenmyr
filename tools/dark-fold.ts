// Folds body.dark rules into per-mode tokens: for each rule the survey finds foldable, the light twin's declaration reads a
// new token `--m-…` in src/web/settings/derivedModes.ts, holding [light value, dark value], and the dark rule goes. It
// only touches a rule it can do whole and safely: one selector, every declaration with a single-selector twin, no raw
// colour, no CSS-wide keyword, and no variable that an element redefines (a token resolves at <body>, so `--ink` inside a
// card, or `--fill`, would read the wrong thing). Everything else is listed with its reason and left for a hand fold.
//   node tools/dark-fold.ts plan  [--status clean,check] [--area name] [--lines a-b,c] [--skip n,m] [--sweep all.json] [--dead n,m] [--cut line:prop,…]
//   (--cut takes one declaration out of a rule that stays, for one that was dead only until its rival was folded)
//   (--dead cuts those rules without a token, for a rule `verify` showed dead: a rival always wins over it)
//   (--sweep leaves out the rules whose element the sweep snapshot never found, which nothing could prove)
//   node tools/dark-fold.ts apply [same options] --manifest out.json   then: node tools/themes-css.ts, node tools/budget.ts --write
//   node tools/dark-fold.ts mutate manifest.json    sets every new token to red in web/themes.css (node tools/themes-css.ts undoes it)
//   node tools/dark-fold.ts verify before.json mutant.json manifest.json   says which folded rules a sweep shows live
// The sweep (tools/dark-sweep.ts) is the proof: sweep before and after on the base stylesheet, then mutate and sweep again to
// catch a token that is dead because a rival always wins (verify names it; delete that dark rule and leave the light one).
import fs from 'node:fs';
import path from 'node:path';
import { parseRules, readMarkup } from './dark-css.ts';
import { type Cut, type Fold, type Manifest, type Picks, type Plan, planOf, type Skip } from './dark-fold-plan.ts';
import { survey } from './dark-survey.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS = path.join(ROOT, 'web', 'style.css');
const THEMES = path.join(ROOT, 'web', 'themes.css');
const TOKENS = path.join(ROOT, 'src', 'web', 'settings', 'derivedModes.ts');

// where the rule whose first selector is `selector` on `line` begins, and where its braces open and close; the rule may
// share its line with others
function blockAt(css: string, line: number, selector: string) {
  const lineStart =
    css
      .split('\n')
      .slice(0, line - 1)
      .join('\n').length + (line > 1 ? 1 : 0);
  const at = css.indexOf(selector, lineStart);
  const start = at < 0 ? lineStart : at;
  const open = css.indexOf('{', start);
  let depth = 1;
  let close = open + 1;
  while (close < css.length && depth) {
    if (css[close] === '{') depth++;
    else if (css[close] === '}') depth--;
    close++;
  }
  return { lineStart, start, open, close };
}

const regexEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const existingTokens = () =>
  new Set([...fs.readFileSync(TOKENS, 'utf8').matchAll(/'(--m-[\w-]+)'/g)].map(m => m[1] ?? ''));

type Edit = { from: number; to: number; text: string };
// the edit that removes a rule and the space around it, whether it has its line to itself or not
function cutRule(blank: string, text: string, r: { lineStart: number; start: number; close: number }): Edit {
  const before = blank.slice(r.lineStart, r.start);
  const after = text.slice(r.close).match(/^[ \t]*/)?.[0] ?? '';
  const endsLine = /^\r?\n|^$/.test(text.slice(r.close + after.length, r.close + after.length + 1));
  if (!before.trim() && endsLine) return { from: r.lineStart, to: r.close + after.length + 1, text: '' };
  if (!before.trim()) return { from: r.start, to: r.close + after.length, text: '' };
  const gap = before.match(/[ \t]*$/)?.[0].length ?? 0;
  return endsLine
    ? { from: r.start - gap, to: r.close + after.length, text: '' }
    : { from: r.start, to: r.close + after.length, text: '' };
}
function apply(plans: Plan[], cuts: Cut[]) {
  const text = fs.readFileSync(CSS, 'utf8');
  const rules = parseRules(text);
  const blank = text.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const taken = existingTokens();
  const tokens = new Map<string, [string, string]>();
  const edits: Edit[] = [];
  const failed: Skip[] = [];
  const names = new Map<number, string[]>();
  for (const p of plans) {
    const mine: Edit[] = [];
    const used: string[] = [];
    const dark = blockAt(blank, p.rule.line, p.rule.selectors[0] ?? '');
    const prelude = blank.slice(dark.start, dark.open).replace(/\s+/g, ' ').trim();
    let why = prelude === p.selector.replace(/\s+/g, ' ') ? '' : 'could not find the rule where the survey said';
    const tokenFor = (f: Fold) => {
      const reuse = [...tokens].find(([, v]) => v[0] === f.light && v[1] === f.dark)?.[0];
      let name = reuse ?? f.token;
      for (let n = 2; !reuse && (tokens.has(name) || taken.has(name)); n++) name = `${f.token}-${n}`;
      tokens.set(name, [f.light, f.dark]);
      used.push(name);
      return name;
    };
    if (p.mode === 'add') {
      // no twin to edit: the dark rule becomes a light rule that reads the tokens, where the dark rule was
      const decls = [...new Set(p.folds.map(f => `${f.prop}: var(${tokenFor(f)})${f.important ? ' !important' : ''}`))];
      const own = p.rule.selectors.map(sel => sel.replace(/^body\.dark /, '')).join(', ');
      if (!why) mine.push({ from: dark.start, to: dark.close, text: `${own} { ${decls.join('; ')}; }` });
    } else
      for (const f of p.folds) {
        if (why) break;
        const light = blockAt(blank, f.lightLine, f.lightSel);
        const body = blank.slice(light.open, light.close);
        const re = new RegExp(`(?:^|[{;\\s])${regexEscape(f.prop)}\\s*:\\s*(${regexEscape(f.light)})`, 'g');
        const hit = [...body.matchAll(re)].at(-1);
        if (!hit) {
          why = `could not find ${f.prop} in the light rule`;
          break;
        }
        const from = light.open + (hit.index ?? 0) + hit[0].length - f.light.length;
        mine.push({ from, to: from + f.light.length, text: `var(${tokenFor(f)})` });
      }
    if (why) {
      failed.push({ line: p.rule.line, selector: p.selector, why });
      continue;
    }
    edits.push(...mine, ...(p.mode === 'add' ? [] : [cutRule(blank, text, dark)]));
    names.set(p.rule.line, used);
  }
  for (const c of cuts) {
    const rule = rules.find(r => r.line === c.line && r.selectors.some(s => /body\.dark/.test(s)));
    const at = rule ? blockAt(blank, c.line, rule.selectors[0] ?? '') : null;
    const body = at ? blank.slice(at.open, at.close) : '';
    const hit = at && new RegExp(`(?:^|[{;\\s])(${regexEscape(c.prop)}\\s*:[^;}]*;?)[ \\t]*`).exec(body);
    if (!at || !hit) {
      failed.push({ line: c.line, selector: rule?.selectors.join(', ') ?? '', why: `could not find ${c.prop} to cut` });
      continue;
    }
    const from = at.open + hit.index + hit[0].indexOf(hit[1] ?? '');
    edits.push({ from, to: at.open + hit.index + hit[0].length, text: '' });
  }
  edits.sort((a, b) => b.from - a.from);
  let out = text;
  for (const e of edits) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  fs.writeFileSync(CSS, out);
  // tokens only the failed rules wanted are not written
  const wanted = new Set([...names.values()].flat());
  return { tokens: new Map([...tokens].filter(([k]) => wanted.has(k))), failed, names };
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const depthOf = (l: string) => (l.match(/\[/g) ?? []).length - (l.match(/\]/g) ?? []).length;
// the tokens file, entry by entry (a comment above an entry travels with it), so new ones can go in name order
function addTokens(tokens: Map<string, [string, string]>) {
  const src = fs.readFileSync(TOKENS, 'utf8');
  const head = 'export const MODE_DERIVED: Record<string, [light: string, dark: string]> = {\n';
  const [before = '', rest = ''] = src.split(head);
  const end = rest.lastIndexOf('};');
  const lines = rest.slice(0, end).split('\n');
  const entries: { key: string; text: string }[] = [];
  let pending: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? '';
    if (!l.trim()) continue;
    if (l.trim().startsWith('//')) {
      pending.push(l);
      continue;
    }
    const chunk = [l];
    for (let d = depthOf(l); d > 0; ) {
      const next = lines[++i] ?? '';
      chunk.push(next);
      d += depthOf(next);
    }
    entries.push({ key: l.match(/'(--m-[\w-]+)'/)?.[1] ?? '', text: `${[...pending, ...chunk].join('\n')}\n` });
    pending = [];
  }
  for (const [k, [l, d]] of tokens) entries.push({ key: k, text: `  '${k}': [${quote(l)}, ${quote(d)}],\n` });
  entries.sort((a, b) => (a.key < b.key ? -1 : 1));
  fs.writeFileSync(TOKENS, `${before}${head}${entries.map(e => e.text).join('')}${rest.slice(end)}`);
}

// the rules a sweep found an element for, from its snapshot
function seenIn(file: string): Set<string> {
  const values: Record<string, string> = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = new Set<string>();
  for (const [k, v] of Object.entries(values))
    if (k.endsWith(' | elements') && Number(v) > 0) out.add(k.split(' | ')[2] ?? '');
  return out;
}

function parseArgs(args: string[]): Picks & { manifest: string } {
  const opt = (name: string) => (args.includes(name) ? (args[args.indexOf(name) + 1] ?? '') : '');
  const ranges = opt('--lines')
    .split(',')
    .filter(Boolean)
    .map(r => r.split('-').map(Number));
  const skip = new Set(opt('--skip').split(',').filter(Boolean).map(Number));
  return {
    area: opt('--area'),
    only: new Set(opt('--status') ? opt('--status').split(',') : ['clean', 'check']),
    pick: line => !skip.has(line) && (!ranges.length || ranges.some(([a = 0, b = a]) => line >= a && line <= b)),
    manifest: opt('--manifest'),
    seen: opt('--sweep') ? seenIn(opt('--sweep')) : undefined,
    cuts: opt('--cut')
      .split(',')
      .filter(Boolean)
      .map(c => ({ line: Number(c.split(':')[0]), prop: c.split(':')[1] ?? '' })),
    dead: new Set(opt('--dead').split(',').filter(Boolean).map(Number)),
  };
}

function mutate(file: string) {
  const manifest: Manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  let css = fs.readFileSync(THEMES, 'utf8');
  for (const t of manifest.folded.flatMap(f => f.tokens)) {
    const re = new RegExp(`(${regexEscape(t)}:)[^;]*;`, 'g');
    if (!re.test(css)) console.log(`NOT IN themes.css: ${t}`);
    css = css.replace(re, '$1 red;');
  }
  fs.writeFileSync(THEMES, css);
  console.log('web/themes.css now has every folded token set to red; node tools/themes-css.ts puts it back');
}

function verify(beforeFile: string, mutantFile: string, manifestFile: string) {
  const before: Record<string, string> = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
  const mutant: Record<string, string> = JSON.parse(fs.readFileSync(mutantFile, 'utf8'));
  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  let bad = 0;
  // a rule cut with no token has nothing to be live
  for (const { id } of manifest.folded.filter(f => f.tokens.length)) {
    const say = (look: string) => {
      const keys = Object.keys(before).filter(k => k.startsWith(`${look} | `) && k.includes(` | ${id.split(' ')[0]} `));
      return { keys: keys.length, changed: keys.filter(k => before[k] !== mutant[k]).length };
    };
    const [dark, light] = [say('default dark'), say('default light')];
    const state = !dark.keys
      ? 'not in the sweep'
      : !dark.changed
        ? 'DEAD in dark'
        : !light.changed
          ? 'not read in light'
          : 'live';
    if (state !== 'live') bad++;
    console.log(`${state.padEnd(18)} dark ${dark.changed}/${dark.keys} light ${light.changed}/${light.keys}  ${id}`);
  }
  console.log(bad ? `${bad} folded rules not proven live` : 'every folded rule is live in dark and light');
  if (bad) process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (command === 'plan' || command === 'apply') {
  const picks = parseArgs(args);
  const rules = parseRules(fs.readFileSync(CSS, 'utf8'));
  const found = survey(rules, readMarkup(ROOT)).filter(f => f.rule.area.startsWith(picks.area));
  const { plans, skipped } = planOf(rules, found, picks);
  for (const p of plans) {
    console.log(`@${p.rule.line} [${p.rule.area.slice(0, 18)}] ${p.selector}`);
    for (const f of p.folds)
      console.log(`    ${f.prop} -> ${f.token}: [${f.light.slice(0, 60)}] [${f.dark.slice(0, 60)}]`);
  }
  for (const s of skipped) console.log(`SKIP @${s.line} ${s.selector.slice(0, 70)}: ${s.why}`);
  console.log(`${plans.length} rules foldable, ${skipped.length} left for a hand fold`);
  if (command === 'apply') {
    const { tokens, failed, names } = apply(plans, picks.cuts);
    addTokens(tokens);
    for (const s of failed) console.log(`FAILED @${s.line} ${s.selector}: ${s.why}`);
    const out: Manifest = {
      folded: plans.flatMap(p =>
        names.has(p.rule.line) ? [{ id: `@${p.rule.line} ${p.selector}`, tokens: names.get(p.rule.line) ?? [] }] : [],
      ),
      skipped: [...skipped, ...failed],
    };
    if (picks.manifest) fs.writeFileSync(picks.manifest, `${JSON.stringify(out, null, 1)}\n`);
    console.log(
      `${out.folded.length} rules folded into ${tokens.size} tokens; now run node tools/themes-css.ts and node tools/budget.ts --write`,
    );
  }
} else if (command === 'mutate' && args[0]) mutate(args[0]);
else if (command === 'verify' && args[0] && args[1] && args[2]) verify(args[0], args[1], args[2]);
else
  throw new Error(
    'node tools/dark-fold.ts plan|apply [--status clean,check] [--area a] [--lines 1-9] [--skip n] [--manifest out.json]  |  mutate manifest.json  |  verify before.json mutant.json manifest.json',
  );
