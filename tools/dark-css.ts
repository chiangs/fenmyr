// Reads a stylesheet for tools/dark-survey.ts: its rules in source order with their specificity, each selector as the
// elements it names, and what the markup in src/web and web/index.html says about the classes the rules use.
import fs from 'node:fs';
import path from 'node:path';

export type Decl = { prop: string; value: string; important: boolean };
export type Rule = { selectors: string[]; decls: Decl[]; ctx: string; line: number; order: number; area: string };
export type Markup = {
  tags: Map<string, Set<string>>;
  together: Set<string>[];
  free: Set<string>;
  templated: Set<string>;
};

export const DARK = /body\.dark(?![\w-])/;
export const STATES = ['hover', 'focus', 'active', 'focus-visible', 'focus-within', 'disabled', 'checked'];

const lineOf = (text: string, at: number) => text.slice(0, at).split('\n').length;
export const norm = (s: string) =>
  s
    .replace(/\s*([>+~])\s*/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0 && !quote) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseDecls(body: string): Decl[] {
  return splitTop(body, ';').flatMap(d => {
    const i = d.indexOf(':');
    const prop = d.slice(0, i).trim();
    if (i < 0 || !prop) return [];
    const value = d.slice(i + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    return [{ prop, value: value.replace(/!\s*important\s*$/i, '').trim(), important }];
  });
}

// the rules in source order, with the @media or @supports they sit in and the banner comment above them
export function parseRules(src: string): Rule[] {
  const banners = [...src.matchAll(/\/\*\s*-{3,}\s*([^\n]*?)\s*-{0,}\s*(?:\n[\s\S]*?)?\*\//g)].map(m => ({
    line: lineOf(src, m.index),
    name: (m[1] ?? '').replace(/[-\s]+$/, ''),
  }));
  const areaAt = (line: number) => banners.filter(b => b.line <= line).at(-1)?.name ?? '(top)';
  const css = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const rules: Rule[] = [];
  const walk = (text: string, offset: number, ctx: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const semi = text.indexOf(';', i);
      if (semi >= 0 && semi < open && text.slice(i, semi).trim().startsWith('@')) {
        i = semi + 1;
        continue;
      }
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const prelude = text.slice(i, open);
      const inner = text.slice(open + 1, j - 1);
      const line = lineOf(css, offset + i + (prelude.length - prelude.trimStart().length));
      if (prelude.trim().startsWith('@')) {
        if (/^@(media|supports|layer|container)/.test(prelude.trim()))
          walk(inner, offset + open + 1, `${ctx} ${prelude.trim().replace(/\s+/g, ' ')}`.trim());
      } else {
        const selectors = splitTop(prelude, ',').map(s => s.trim().replace(/\s+/g, ' '));
        rules.push({ selectors, decls: parseDecls(inner), ctx, line, order: rules.length, area: areaAt(line) });
      }
      i = j;
    }
  };
  walk(css, 0, '');
  return rules;
}

// ids, then classes/attributes/pseudo-classes, then types, as one comparable number
export function specificity(sel: string): number {
  const n = { ids: 0, classes: 0, types: 0 };
  let s = sel;
  const take = (re: RegExp, key: keyof typeof n) => {
    s = s.replace(re, () => {
      n[key]++;
      return '';
    });
  };
  const fn = /:(is|not|has|where|matches)\(((?:[^()]|\([^()]*\))*)\)/;
  for (let m = fn.exec(s); m; m = fn.exec(s)) {
    if (m[1] !== 'where') {
      const best = Math.max(...splitTop(m[2] ?? '', ',').map(specificity));
      n.ids += Math.floor(best / 1e6);
      n.classes += Math.floor((best % 1e6) / 1e3);
      n.types += best % 1e3;
    }
    s = s.replace(fn, '');
  }
  take(/::?(before|after|first-line|first-letter|placeholder|selection|-[\w-]+)/g, 'types');
  take(/\[[^\]]*\]/g, 'classes');
  take(/#[\w-]+/g, 'ids');
  take(/\.[\w-]+/g, 'classes');
  take(/:[\w-]+(\([^)]*\))?/g, 'classes');
  take(/(^|[\s>+~])([a-zA-Z][\w-]*)/g, 'types');
  return n.ids * 1e6 + n.classes * 1e3 + n.types;
}

const parts = (sel: string) => norm(sel).split(/ [>+~] | /);
// the states (hover, focus) a selector needs: `hover` when its last part has to be hovered, `^hover` when an ancestor does
export const statesOf = (sel: string) => {
  const all = parts(sel);
  return new Set(
    all.flatMap((c, i) =>
      STATES.filter(st => new RegExp(`:${st}(?![\\w-])`).test(c)).map(st => (i === all.length - 1 ? st : `^${st}`)),
    ),
  );
};
// hovering an element hovers its ancestors too
export const withAncestors = (state: Set<string>) =>
  new Set([...state, ...[...state].map(s => (s.startsWith('^') ? s : `^${s}`))]);
export const subsetOf = (x: Set<string>, y: Set<string>) => [...x].every(v => y.has(v));
export const pseudoElement = (c: Compound) =>
  c.other.find(o => /^::?(before|after|first-line|first-letter|placeholder|selection|-webkit-)/.test(o)) ?? '';

// the markup: which tags carry each class, which classes share an element, which classes script adds (any element may get them)
export function readMarkup(root: string): Markup {
  const m: Markup = { tags: new Map(), together: [], free: new Set(), templated: new Set() };
  const scan = (file: string) => {
    if (fs.statSync(file).isDirectory()) {
      for (const f of fs.readdirSync(file)) scan(path.join(file, f));
      return;
    }
    if (!/\.(ts|html)$/.test(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    for (const t of text.matchAll(/<([a-zA-Z][\w-]*)\b[^<>]*?\bclass="([^"]*)"/g)) {
      const classes = (t[2] ?? '')
        .replace(/\$\{[^}]*\}/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
      for (const c of classes) {
        m.templated.add(c);
        m.tags.set(c, (m.tags.get(c) ?? new Set()).add((t[1] ?? '').toLowerCase()));
      }
      m.together.push(new Set(classes));
    }
    for (const t of text.matchAll(/classList\.(?:add|toggle|remove)\(\s*['"`]([\w-]+)['"`]/g)) m.free.add(t[1] ?? '');
    for (const t of text.matchAll(/\.className\s*\+?=\s*['"`]([^'"`]*)['"`]/g))
      for (const c of (t[1] ?? '').split(/\s+/).filter(Boolean)) m.free.add(c);
  };
  scan(path.join(root, 'src'));
  scan(path.join(root, 'web', 'index.html'));
  return m;
}

// a selector as the elements it names: tag, classes, ids, attributes and other pseudo-classes of each compound, with the
// states (hover, focus) left out because the survey tries those itself
type Compound = { tag: string; classes: string[]; ids: string[]; attrs: string[]; other: string[] };
export type Shape = { ancestors: Compound[]; subject: Compound };
const STATE_RE = new RegExp(`:(${STATES.join('|')})(?![\\w-])`, 'g');
function compound(text: string): Compound {
  const noAttr = text.replace(STATE_RE, '').replace(/\[[^\]]*\]/g, '');
  const other = noAttr.match(/::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?/g) ?? [];
  const bare = noAttr.replace(/::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?/g, '');
  return {
    tag: bare.match(/^(?:[a-zA-Z][\w-]*|\*)/)?.[0] ?? '',
    classes: (bare.match(/\.[\w-]+/g) ?? []).map(c => c.slice(1)),
    ids: bare.match(/#[\w-]+/g) ?? [],
    attrs: text.match(/\[[^\]]*\]/g) ?? [],
    other,
  };
}
export const shapeOf = (sel: string): Shape => {
  const all = parts(sel.replace(/^body\.dark /, '')).map(compound);
  return { ancestors: all.slice(0, -1), subject: all.at(-1) ?? compound('') };
};
// does every element that matches u match c?
const within = (c: Compound, u: Compound) =>
  (c.tag === '' || c.tag === '*' || c.tag === u.tag) &&
  c.classes.every(x => u.classes.includes(x)) &&
  c.ids.every(x => u.ids.includes(x)) &&
  c.attrs.every(x => u.attrs.includes(x)) &&
  c.other.every(x => u.other.includes(x));
export const implied = (r: Shape, u: Shape) =>
  within(r.subject, u.subject) && r.ancestors.every(a => u.ancestors.some(b => within(a, b)));
// the element that matches both, or null when none can
export function merge(a: Shape, b: Shape): Shape | null {
  const [x, y] = [a.subject, b.subject];
  const real = (t: string) => t !== '' && t !== '*';
  if (real(x.tag) && real(y.tag) && x.tag !== y.tag) return null;
  const union = (p: string[], q: string[]) => [...new Set([...p, ...q])];
  const ids = union(x.ids, y.ids);
  if (ids.length > 1) return null;
  const tag = real(x.tag) ? x.tag : y.tag;
  return {
    ancestors: [...a.ancestors, ...b.ancestors],
    subject: {
      tag,
      ids,
      classes: union(x.classes, y.classes),
      attrs: union(x.attrs, y.attrs),
      other: union(x.other, y.other),
    },
  };
}
