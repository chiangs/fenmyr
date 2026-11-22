// Surveys the body.dark rules in the stylesheet, to say which can fold into a per-mode token (src/web/settings/derivedModes.ts).
// A body.dark declaration folds when a light rule styles the same selector and property (its twin) and no other rule would
// win once the twin holds the dark value: today the dark rule outranks that rival, afterwards the twin does not. A rival that
// every element of the twin matches always counts; any other rival is tried on its own, with the rules it brings with it, in
// each state (plain, hover, focus). The markup in src/web and web/index.html drops rivals that cannot share an element.
//   node tools/dark-survey.ts [web/style.css]                         occurrences by area, by what can be done with them
//   node tools/dark-survey.ts [web/style.css] --area layers           each rule of the areas starting with that name
//   node tools/dark-survey.ts [web/style.css] --status delete         each rule of that status, in every area
// delete: nothing needs a token, because the dark declaration never applies or says what the light rule says.
// clean: no rival at all. check: only rivals named by a tag or attribute, whose ancestors the markup has to settle.
// blocked: no twin, the light rule lacks the property, a compound selector, or a rival that shares a class or id and wins.
import fs from 'node:fs';
import path from 'node:path';
import {
  DARK,
  type Decl,
  implied,
  type Markup,
  merge,
  norm,
  parseRules,
  pseudoElement,
  type Rule,
  readMarkup,
  type Shape,
  shapeOf,
  specificity,
  statesOf,
  subsetOf,
  withAncestors,
} from './dark-css.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
type Kind = 'twin' | 'no-twin' | 'dark-only-prop' | 'compound';
type Rival = { line: number; selector: string; prop: string; tier: 'strict' | 'tag'; state: string };
type Twin = { line: number; prop: string; value: string };
export type Finding = {
  rule: Rule;
  selector: string;
  decl: Decl;
  kind: Kind;
  twin?: Twin;
  rivals: Rival[];
  dead: boolean;
  same: boolean;
};
export type Status = 'delete' | 'clean' | 'check' | 'blocked';

// could the rule at `other` style the same element as `own`? strict: they share a class or id. tag: the other names only a tag or attribute.
function competes(own: Shape, other: Shape, markup: Markup): 'strict' | 'tag' | null {
  const [a, b] = [own.subject, other.subject];
  if (pseudoElement(a) !== pseudoElement(b)) return null;
  if (a.tag && b.tag && a.tag !== b.tag) return null;
  // the markup knows what tag carries these classes, so a rule that names another tag cannot style the element
  const fixed = a.classes.filter(x => !markup.free.has(x));
  const known = fixed.length > 0 && fixed.every(x => markup.tags.has(x));
  const here = new Set(fixed.flatMap(x => [...(markup.tags.get(x) ?? [])]));
  if (!a.tag && b.tag && b.tag !== '*' && known && !here.has(b.tag)) return null;
  if (a.ids.length && b.ids.length && a.ids.some(x => !b.ids.includes(x)) && b.ids.some(x => !a.ids.includes(x)))
    return null;
  if (a.classes.some(x => b.classes.includes(x)) || a.ids.some(x => b.ids.includes(x))) {
    const need = [...new Set([...a.classes, ...b.classes])].filter(x => !markup.free.has(x));
    const never = need.every(x => markup.templated.has(x)) && !markup.together.some(set => need.every(x => set.has(x)));
    return never && b.classes.some(x => !a.classes.includes(x) && !markup.free.has(x)) ? null : 'strict';
  }
  return b.classes.length || b.ids.length ? null : 'tag';
}

type Cand = {
  role: 'dark' | 'light' | 'rival';
  sel: string;
  shape: Shape;
  spec: number;
  order: number;
  important: boolean;
  value: string;
  line: number;
  prop: string;
  tier?: 'strict' | 'tag';
};
const sameProp = (a: string, b: string) =>
  a === b || (a.split('-')[0] === b.split('-')[0] && (!a.includes('-') || !b.includes('-')));
const wins = (x: Cand, y: Cand) =>
  x.important !== y.important ? x.important : x.spec !== y.spec ? x.spec > y.spec : x.order > y.order;
const top = (cs: Cand[]) => cs.reduce((m, c) => (wins(c, m) ? c : m));

// every combination of the states the rules mention, among those the dark rule applies in
function statesFor(cs: Cand[], dark: Cand): Set<string>[] {
  const subsets: Set<string>[] = [new Set()];
  for (const st of new Set(cs.flatMap(c => [...statesOf(c.sel)])))
    for (const x of [...subsets]) subsets.push(new Set([...x, st]));
  return subsets.filter(state => subsetOf(statesOf(dark.sel), withAncestors(state)));
}

// the scenarios to try: the rivals every element of the twin has, then each other rival alone with what comes with it
function scenarios(twin: Cand, rivals: Cand[]): Cand[][] {
  const always = rivals.filter(c => implied(c.shape, twin.shape));
  const found = [always];
  const keys = new Set([always.map(c => `${c.order}${c.sel}`).join()]);
  for (const r of rivals) {
    const both = always.includes(r) ? null : merge(twin.shape, r.shape);
    const set = both && rivals.filter(c => implied(c.shape, both));
    const key = set?.map(c => `${c.order}${c.sel}`).join();
    if (set && key !== undefined && !keys.has(key)) {
      keys.add(key);
      found.push(set);
    }
  }
  return found;
}

// a declaration that no state lets win: a rival every element has always outranks it
function neverApplies(dark: Cand, twin: Cand | undefined, rivals: Cand[]): boolean {
  const always = twin
    ? [twin, ...rivals.filter(c => implied(c.shape, twin.shape))]
    : rivals.filter(c => implied(c.shape, dark.shape));
  return statesFor(always, dark).every(
    state => top([dark, ...always.filter(c => subsetOf(statesOf(c.sel), withAncestors(state)))]).role !== 'dark',
  );
}

// the rivals that win once the twin holds the dark value: in some state the dark rule wins now and a rival is next
function rivalsOf(dark: Cand, twin: Cand, rivals: Cand[]): Rival[] {
  const analyse = (cs: Cand[]) => {
    const out: Rival[] = [];
    for (const sc of scenarios(twin, cs)) {
      const all = [dark, twin, ...sc];
      for (const state of statesFor(all, dark)) {
        if (!subsetOf(statesOf(twin.sel), withAncestors(state))) continue;
        const live = all.filter(c => subsetOf(statesOf(c.sel), withAncestors(state)));
        if (top(live).role !== 'dark') continue;
        const next = top(live.filter(c => c.role !== 'dark'));
        // a rival that says the same thing changes nothing when it wins
        if (
          next.role === 'rival' &&
          next.value !== dark.value &&
          !out.some(r => r.line === next.line && r.selector === next.sel)
        )
          out.push({
            line: next.line,
            selector: next.sel,
            prop: next.prop,
            tier: next.tier ?? 'tag',
            state: [...state].join('+') || 'plain',
          });
      }
    }
    return out;
  };
  // strict rivals alone first, so a tag-named rival cannot hide them
  const strict = analyse(rivals.filter(c => c.tier === 'strict'));
  const every = analyse(rivals);
  return [...strict, ...every.filter(r => !strict.some(s => s.line === r.line && s.selector === r.selector))];
}

const cand = (role: Cand['role'], sel: string, rule: Rule, d: Decl, extra: Partial<Cand> = {}): Cand => ({
  role,
  sel,
  shape: shapeOf(sel),
  spec: specificity(sel),
  order: rule.order,
  important: d.important,
  value: d.value.replace(/\s+/g, ' '),
  line: rule.line,
  prop: d.prop,
  ...extra,
});

export function survey(rules: Rule[], markup: Markup): Finding[] {
  const light = rules.filter(r => !r.selectors.every(s => DARK.test(s)));
  const found: Finding[] = [];
  for (const rule of rules) {
    for (const selector of rule.selectors.filter(s => DARK.test(s))) {
      for (const decl of rule.decls) {
        const kind: Kind = /^body\.dark /.test(selector) ? 'no-twin' : 'compound';
        const f: Finding = { rule, selector, decl, kind, rivals: [], dead: false, same: false };
        found.push(f);
        if (kind === 'compound') continue;
        const own = norm(selector.replace(/^body\.dark /, ''));
        const all = light.filter(l => l.ctx === rule.ctx && l.selectors.some(s => norm(s) === own));
        // the twin is the light rule just above the dark one, so two dark rules for one selector pair with their own
        const sameSel = all.some(l => l.order < rule.order) ? all.filter(l => l.order < rule.order) : all;
        const exact = sameSel.filter(l => l.decls.some(d => d.prop === decl.prop)).at(-1);
        const near = exact ?? sameSel.at(-1);
        const sibling = exact
          ? exact.decls.find(d => d.prop === decl.prop)
          : near?.decls.find(d => sameProp(d.prop, decl.prop));
        if (near) {
          f.kind = exact ? 'twin' : 'dark-only-prop';
          f.twin = { line: near.line, prop: sibling?.prop ?? '', value: sibling?.value ?? '' };
          f.same = !!exact && f.twin.value.replace(/\s+/g, ' ') === decl.value.replace(/\s+/g, ' ');
        }
        const ownShape = shapeOf(own);
        const dark = cand('dark', selector, rule, decl);
        const twin = near && cand('light', own, near, { ...decl, important: false });
        const rivals = rules.flatMap(o =>
          o === rule || o === near
            ? []
            : o.selectors.flatMap((os): Cand[] => {
                const shape = shapeOf(os);
                const tier = competes(ownShape, shape, markup);
                const d = tier && o.decls.find(x => sameProp(x.prop, decl.prop));
                return tier && d ? [cand('rival', os, o, d, { tier, shape })] : [];
              }),
        );
        f.dead = neverApplies(dark, twin, rivals);
        if (f.kind === 'twin' && twin) f.rivals = rivalsOf(dark, twin, rivals);
      }
    }
  }
  return found;
}

// a rule stops counting only when every declaration of every selector folds or goes
export function statusOf(fs: Finding[]): Status {
  const live = fs.filter(f => !f.dead);
  if (!live.length) return 'delete';
  if (live.some(f => f.kind !== 'twin' || f.rivals.some(r => r.tier === 'strict'))) return 'blocked';
  if (live.every(f => f.same && !f.rivals.length)) return 'delete';
  return live.some(f => f.rivals.length) ? 'check' : 'clean';
}

export function byRule(found: Finding[]) {
  const rules = new Map<Rule, Finding[]>();
  for (const f of found) rules.set(f.rule, [...(rules.get(f.rule) ?? []), f]);
  return rules;
}
const occurrences = (r: Rule) => r.selectors.reduce((n, s) => n + (s.match(new RegExp(DARK, 'g')) ?? []).length, 0);

function table(found: Finding[]) {
  const areas = new Map<string, Record<Status | 'total', number>>();
  for (const [rule, fs] of byRule(found)) {
    const row = areas.get(rule.area) ?? { delete: 0, clean: 0, check: 0, blocked: 0, total: 0 };
    row[statusOf(fs)] += occurrences(rule);
    row.total += occurrences(rule);
    areas.set(rule.area, row);
  }
  const rows = [...areas].sort((x, y) => x[1].total - y[1].total);
  const line = (name: string, r: Record<Status | 'total', number>) =>
    name.slice(0, 50).padEnd(52) +
    [r.total, r.delete, r.clean, r.check, r.blocked].map((n, i) => String(n).padStart(i === 4 ? 9 : 7)).join('');
  console.log(`${'area'.padEnd(52)}  total delete  clean  check  blocked`);
  for (const [area, r] of rows) console.log(line(area, r));
  const sum = (k: Status | 'total') => rows.reduce((n, [, r]) => n + r[k], 0);
  console.log(
    line('all', {
      total: sum('total'),
      delete: sum('delete'),
      clean: sum('clean'),
      check: sum('check'),
      blocked: sum('blocked'),
    }),
  );
}

function detail(found: Finding[], area: string, status: string) {
  for (const [rule, fs] of byRule(found)) {
    if (!rule.area.startsWith(area) || (status && statusOf(fs) !== status)) continue;
    console.log(`@${rule.line} [${statusOf(fs)}] ${rule.selectors.join(', ')}`);
    for (const f of fs) {
      const note = f.dead ? '  (never applies)' : f.same ? '  (the light rule says the same)' : '';
      console.log(`    ${f.kind}  ${f.decl.prop}: ${f.decl.value.slice(0, 100)}${note}`);
      if (f.twin) {
        const prop = f.twin.prop && f.twin.prop !== f.decl.prop ? ` (${f.twin.prop})` : '';
        console.log(`        light @${f.twin.line}${prop}: ${f.twin.value.slice(0, 100) || '-'}`);
      }
      for (const r of f.rivals)
        console.log(`        rival (${r.tier}) @${r.line} ${r.selector} {${r.prop}}, in state ${r.state}`);
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string) => (args.includes(name) ? (args[args.indexOf(name) + 1] ?? '') : undefined);
  const [area, status] = [option('--area'), option('--status')];
  const file =
    args.find((a, i) => !a.startsWith('--') && !['--area', '--status'].includes(args[i - 1] ?? '')) ??
    path.join(ROOT, 'web', 'style.css');
  const found = survey(parseRules(fs.readFileSync(file, 'utf8')), readMarkup(ROOT));
  if (area !== undefined || status !== undefined) detail(found, area ?? '', status ?? '');
  else table(found);
}
