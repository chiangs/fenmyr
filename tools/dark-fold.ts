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
import {
  implied,
  norm,
  parseRules,
  pseudoElement,
  type Rule,
  readMarkup,
  shapeOf,
  specificity,
  statesOf,
  subsetOf,
  withAncestors,
} from './dark-css.ts';
import { byRule, type Finding, statusOf, survey } from './dark-survey.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS = path.join(ROOT, 'web', 'style.css');
const THEMES = path.join(ROOT, 'web', 'themes.css');
const TOKENS = path.join(ROOT, 'src', 'web', 'settings', 'derivedModes.ts');

type Fold = {
  prop: string;
  lightLine: number;
  lightSel: string;
  light: string;
  dark: string;
  token: string;
  important: boolean;
};
// twin: each declaration's light twin reads the token. add: a rule with no twin of its own becomes a light rule that reads them
type Plan = { rule: Rule; selector: string; folds: Fold[]; mode: 'twin' | 'add' };
type Skip = { line: number; selector: string; why: string };
// one declaration to take out of a dark rule that stays: it was dead only because another dark rule won over it
type Cut = { line: number; prop: string };
type Manifest = { folded: { id: string; tokens: string[] }[]; skipped: Skip[] };

const ROOTISH = /^(:root|html|body)(\.[\w-]+)*$/;
// the variables an element can redefine: set by a rule below the root, by a style attribute or by script on an element
function scopedVars(rules: Rule[]): Set<string> {
  const out = new Set<string>();
  for (const r of rules)
    if (!r.selectors.every(s => ROOTISH.test(s))) for (const d of r.decls) if (d.prop.startsWith('--')) out.add(d.prop);
  const scan = (file: string) => {
    if (fs.statSync(file).isDirectory()) {
      if (path.basename(file) !== 'settings') for (const f of fs.readdirSync(file)) scan(path.join(file, f));
    } else if (file.endsWith('.ts')) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/setProperty\(\s*['"](--[\w-]+)/g)) out.add(m[1] ?? '');
      for (const m of text.matchAll(/style=\\?"[^"]*?(--[\w-]+)\s*:/g)) out.add(m[1] ?? '');
    }
  };
  scan(path.join(ROOT, 'src'));
  return out;
}

const RAW = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]/i;
const KEYWORD = /^(inherit|initial|unset|revert|revert-layer)$/;
// a card redefines the ink variables for what is inside it, so only a rule for something no card holds may read them
const CARD_INK = new Set(['--ink', '--ink-soft', '--ink-faint']);
function cardClasses(): Set<string> {
  const out = new Set(['card']);
  const scan = (file: string) => {
    if (fs.statSync(file).isDirectory()) for (const f of fs.readdirSync(file)) scan(path.join(file, f));
    else if (file.endsWith('.ts'))
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/class=\\?"([^"]*)"/g))
        for (const c of (m[1] ?? '').replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (c) out.add(c);
  };
  for (const dir of ['canvas', 'cards']) scan(path.join(ROOT, 'src', 'web', dir));
  return out;
}
type Guard = { scoped: Set<string>; inCard: (selector: string) => boolean };
function whyNot(value: string, selector: string, { scoped, inCard }: Guard): string {
  if (RAW.test(value)) return `a raw colour in "${value.slice(0, 50)}"`;
  if (KEYWORD.test(value)) return `the value "${value}" can't be a token`;
  const hit = [...value.matchAll(/var\((--[\w-]+)/g)]
    .map(m => m[1] ?? '')
    .find(v => scoped.has(v) && !(CARD_INK.has(v) && !inCard(selector)));
  return hit ? `${hit} is redefined by an element` : '';
}

const ABBR: Record<string, string> = {
  background: 'bg',
  'background-color': 'bg',
  'background-image': 'img',
  color: 'ink',
  'box-shadow': 'shadow',
  'border-color': 'line',
  'text-shadow': 'tshadow',
};
function nameOf(selector: string, prop: string): string {
  const words = selector
    .replace(/^body\.dark /, '')
    .replace(/\[[^\]]*\]|:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/::?/g, ' ')
    .match(/[a-zA-Z][\w-]*/g);
  const slug = (words ?? ['x']).slice(-4).join('-').toLowerCase().replace(/-+/g, '-');
  return `--m-${slug}-${ABBR[prop] ?? prop}`;
}

// what the light rules say for a selector that has no twin: among the rules above the dark one that name every element it
// names (and no more state), the one that wins; else the property's initial value
const INITIAL: Record<string, string> = {
  background: 'transparent',
  'background-color': 'transparent',
  'background-image': 'none',
  'box-shadow': 'none',
  'border-color': 'currentcolor',
  stroke: 'none',
  opacity: '1',
  filter: 'none',
};
// properties a shorthand also sets: a light rule that sets one of these may be what the dark rule overrides
const RELATED: Record<string, string[]> = {
  'border-color': ['border', 'border-top', 'border-right', 'border-bottom', 'border-left'],
  'background-color': ['background'],
  'background-image': ['background'],
  background: ['background-color', 'background-image'],
};
function appliedLight(light: Rule[], rule: Rule, selector: string, prop: string) {
  const own = norm(selector.replace(/^body\.dark /, ''));
  const mine = shapeOf(own);
  const states = withAncestors(statesOf(own));
  const found: { value: string; important: boolean; spec: number; order: number }[] = [];
  for (const l of light) {
    if (l.ctx !== rule.ctx || l.order > rule.order) continue;
    const d = l.decls.find(x => x.prop === prop);
    const related = l.decls.some(x => RELATED[prop]?.includes(x.prop));
    for (const s of l.selectors) {
      const shape = shapeOf(s);
      if (
        !(
          implied(shape, mine) &&
          pseudoElement(shape.subject) === pseudoElement(mine.subject) &&
          subsetOf(statesOf(s), states)
        )
      )
        continue;
      if (related) return null;
      if (d) found.push({ value: d.value, important: d.important, spec: specificity(s), order: l.order });
    }
  }
  const win = found.reduce<(typeof found)[number] | undefined>(
    (m, c) =>
      !m || (c.important !== m.important ? c.important : c.spec !== m.spec ? c.spec > m.spec : c.order > m.order)
        ? c
        : m,
    undefined,
  );
  return win
    ? { value: win.value, important: win.important }
    : INITIAL[prop]
      ? { value: INITIAL[prop], important: false }
      : null;
}

type Picks = {
  cuts: Cut[];
  area: string;
  only: Set<string>;
  pick: (line: number) => boolean;
  seen?: Set<string>;
  dead: Set<number>;
};
function planOf(rules: Rule[], found: Finding[], { only, pick, seen, dead }: Picks) {
  const cards = cardClasses();
  const guard: Guard = {
    scoped: scopedVars(rules),
    inCard: sel => (sel.match(/\.[\w-]+/g) ?? []).some(c => cards.has(c.slice(1))),
  };
  const light = rules.filter(r => !r.selectors.some(s => /body\.dark(?![\w-])/.test(s)));
  const plans: Plan[] = [];
  const skipped: Skip[] = [];
  for (const [rule, fs] of byRule(found)) {
    if (!pick(rule.line) || !only.has(statusOf(fs))) continue;
    const selector = rule.selectors.join(', ');
    const no = (why: string) => skipped.push({ line: rule.line, selector, why });
    const folds: (Fold & { viaTwin: boolean })[] = [];
    let why = '';
    // a rule `verify` showed dead goes without a token: the light rule keeps its own value
    if (dead.has(rule.line)) {
      plans.push({ rule, selector, folds, mode: 'twin' });
      continue;
    }
    for (const f of fs) {
      if (seen && !seen.has(`@${rule.line} ${f.selector}`)) {
        why = 'no scene of the sweep shows its element';
        break;
      }
      // a declaration that never applies, or says what the light rule says, goes with the rule and needs no token
      if (!f.selector.startsWith('body.dark ')) {
        why = 'a compound selector';
        break;
      }
      if (f.dead || f.same) continue;
      if (f.decl.prop.startsWith('--') || /--card-/.test(f.decl.value)) {
        why = 'it sets a card ink variable or a custom property';
        break;
      }
      const twinRule = f.twin && light.find(r => r.line === f.twin?.line);
      const twinDecl = twinRule?.decls.find(d => d.prop === f.decl.prop);
      let from: { light: string; line: number; sel: string; viaTwin: boolean } | undefined;
      if (f.kind === 'twin' && f.twin && twinRule && twinDecl) {
        if (twinDecl.important !== f.decl.important) why = `${f.decl.prop}: !important differs from the light rule`;
        else
          from = {
            light: twinDecl.value,
            line: f.twin.line,
            sel: twinRule.selectors[0] ?? '',
            viaTwin: twinRule.selectors.length === 1,
          };
      } else {
        const a = appliedLight(light, rule, f.selector, f.decl.prop);
        if (!a) why = `no light value for ${f.decl.prop}`;
        else if (a.important !== f.decl.important) why = `${f.decl.prop}: !important differs from the light value`;
        else from = { light: a.value, line: 0, sel: '', viaTwin: false };
      }
      if (!why && from) why = whyNot(from.light, f.selector, guard) || whyNot(f.decl.value, f.selector, guard);
      if (why || !from) break;
      folds.push({
        prop: f.decl.prop,
        lightLine: from.line,
        lightSel: from.sel,
        light: from.light,
        dark: f.decl.value,
        token: nameOf(f.selector, f.decl.prop),
        important: f.decl.important,
        viaTwin: from.viaTwin,
      });
    }
    // one light rule can only say one thing per declaration
    const differ = folds.find(f => folds.some(g => g.prop === f.prop && g.light !== f.light));
    if (!why && differ) why = `the selectors disagree on the light ${differ.prop}`;
    const mode = folds.every(f => f.viaTwin) ? 'twin' : 'add';
    if (!why && mode === 'add' && !rule.selectors.every(sel => sel.startsWith('body.dark ')))
      why = 'a compound selector';
    if (why) no(why);
    else plans.push({ rule, selector, folds: folds.map(({ viaTwin: _, ...f }) => f), mode });
  }
  return { plans, skipped };
}

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
