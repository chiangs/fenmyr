// The planning half of tools/dark-fold.ts: which dark rules can fold, with which light value and token, and why the others
// can't. It reads the survey's findings and the stylesheet; it writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import {
  implied,
  norm,
  pseudoElement,
  type Rule,
  shapeOf,
  specificity,
  statesOf,
  subsetOf,
  withAncestors,
} from './dark-css.ts';
import { byRule, type Finding, statusOf } from './dark-survey.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

export type Fold = {
  prop: string;
  lightLine: number;
  lightSel: string;
  light: string;
  dark: string;
  token: string;
  important: boolean;
};
// twin: each declaration's light twin reads the token. add: a rule with no twin of its own becomes a light rule that reads them
export type Plan = { rule: Rule; selector: string; folds: Fold[]; mode: 'twin' | 'add' };
export type Skip = { line: number; selector: string; why: string };
// one declaration to take out of a dark rule that stays: it was dead only because another dark rule won over it
export type Cut = { line: number; prop: string };
export type Manifest = { folded: { id: string; tokens: string[] }[]; skipped: Skip[] };

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

// what the light rules say for a selector that has no twin: among the rules that name every element it
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
// `color` with no light rule takes its parent's colour, which a token can say as `currentcolor`: for `color` that is the
// inherited value. (Other inherited properties, fill and stroke, read currentcolor as the element's colour, so they are left.)
const INHERITED = new Set(['color']);
const RELATED: Record<string, string[]> = {
  'border-color': ['border', 'border-top', 'border-right', 'border-bottom', 'border-left'],
  'background-color': ['background'],
  'background-image': ['background'],
  background: ['background-color', 'background-image'],
};
// the colour a shorthand sets: `border: 1.5px solid X` sets border-color X, `background: X` sets background-color X
const STYLES = /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/;
const WIDTH = /^(thin|medium|thick|-?[\d.]+[a-z%]*)$/;
function tokens(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && !depth) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += ch;
  }
  return cur ? [...out, cur] : out;
}
function colourOf(prop: string, shorthand: string, value: string): string | null {
  const parts = tokens(value);
  if (prop === 'border-color' && shorthand === 'border') {
    const rest = parts.filter(t => !STYLES.test(t) && !WIDTH.test(t));
    return rest.length === 0 ? 'currentcolor' : rest.length === 1 ? (rest[0] ?? null) : null;
  }
  if (prop === 'background-color' && shorthand === 'background') {
    if (value.trim() === 'none') return 'transparent';
    return parts.length === 1 && !/^(url|[\w-]*gradient)/.test(value) ? (parts[0] ?? null) : null;
  }
  return null;
}
function appliedLight(light: Rule[], rule: Rule, selector: string, prop: string) {
  const own = norm(selector.replace(/^body\.dark /, ''));
  const mine = shapeOf(own);
  const states = withAncestors(statesOf(own));
  const found: { value: string; important: boolean; spec: number; order: number }[] = [];
  for (const l of light) {
    if (l.ctx !== rule.ctx) continue;
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
      const at = { spec: specificity(s), order: l.order };
      if (related) {
        // a shorthand in the light rule: take the colour out of it, or leave the rule to a hand fold
        const sh = l.decls.find(x => RELATED[prop]?.includes(x.prop));
        const value = sh && colourOf(prop, sh.prop, sh.value);
        if (!sh || !value) return 'related' as const;
        found.push({ value, important: sh.important, ...at });
      } else if (d) found.push({ value: d.value, important: d.important, ...at });
    }
  }
  const win = found.reduce<(typeof found)[number] | undefined>(
    (m, c) =>
      !m || (c.important !== m.important ? c.important : c.spec !== m.spec ? c.spec > m.spec : c.order > m.order)
        ? c
        : m,
    undefined,
  );
  if (win) return { value: win.value, important: win.important };
  if (INITIAL[prop]) return { value: INITIAL[prop], important: false };
  return INHERITED.has(prop) ? { value: 'currentcolor', important: false } : null;
}

export type Picks = {
  cuts: Cut[];
  area: string;
  only: Set<string>;
  pick: (line: number) => boolean;
  seen?: Set<string>;
  // rules to cut with no token: `all`, a line, or `line:text` for one rule of a shared line
  dead: Set<string>;
};
export function planOf(rules: Rule[], found: Finding[], { only, pick, seen, dead }: Picks) {
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
    const named = [...dead].some(
      d =>
        d === String(rule.line) ||
        (d.startsWith(`${rule.line}:`) && selector.includes(d.slice(String(rule.line).length + 1))),
    );
    if (named || (dead.has('all') && rule.selectors.every(sel => !seen || seen.has(`@${rule.line} ${sel}`)))) {
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
        if (a === 'related') why = `a shorthand sets ${f.decl.prop} in the light rules`;
        else if (!a) why = `no light value for ${f.decl.prop}`;
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
