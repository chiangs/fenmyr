// Reads the stylesheet into rules, finds each colour a rule shows in light and in dark mode, and matches those pairs
// against the core tokens. The part of tools/colour-fit.ts that decides what could change; colour-rewrite.ts changes it.
import { apart, isGrey, mixOklab, mixOklch } from '../src/web/ui/color.ts';

export type Pair = [light: string, dark: string];
type Fit = { expr: string; light: number; dark: number };
export type Group = {
  light: string;
  dark: string;
  // a token used in only one mode has to match in that mode alone
  only?: 'light' | 'dark';
  tokens: string[];
  uses: number;
  allowed: boolean;
  fit: Fit | null;
  nearest: Fit | null;
};
export type Decl = { prop: string; value: string; propStart: number; valueStart: number; end: number };
export type Rule = { parts: string[]; start: number; end: number; decls: Decl[] };
export type Use = {
  rule: number;
  decl: number;
  keys: string[];
  slots: (Group | null)[];
  keysOfParts: string[];
  was: [string, string];
};

export const DARK = /^body\.dark\s+/;
const ALLOWED = 0.06;
const STEPS = Array.from({ length: 23 }, (_, i) => (i + 1) * 4);
const varsOf = (v: string) => [...v.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1] ?? '');
// two values pair up variable by variable when they are the same apart from which variables they name
const shape = (v: string) => v.replace(/var\(--[\w-]+\)/g, '@');
export const isDark = (r: Rule) => r.parts.every(p => DARK.test(p));
const FALLBACK = /var\(--[\w-]+\s*,/;

export function parseRules(css: string) {
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

// the colour a token has in each mode: its :root value, and the one body.dark gives it, if any. A token that a rule for
// some part of the page defines again (the doc view's --paper-ink) has no one colour, so it is left out.
function tokenValues(rules: Rule[]) {
  const light = new Map<string, string>(),
    dark = new Map<string, string>(),
    scoped = new Set<string>();
  for (const r of rules)
    for (const d of r.decls) {
      if (!d.prop.startsWith('--')) continue;
      const sel = r.parts.length === 1 ? r.parts[0] : '',
        hex = /^#[0-9a-fA-F]{6}$/.test(d.value);
      if (sel === 'body.dark' && hex) dark.set(d.prop, d.value.toLowerCase());
      else if (sel === ':root' && hex) light.set(d.prop, d.value.toLowerCase());
      else if (sel !== 'body.dark' && sel !== ':root') scoped.add(d.prop);
    }
  return { light, dark, scoped };
}

export function fit(g: Group, core: Map<string, Pair>, tolerance: number) {
  const names = [...core.keys()],
    seen = (a: Pair, expr: string): Fit => ({
      expr,
      light: apart(a[0], g.light, 'typical'),
      dark: apart(a[1], g.dark, 'typical'),
    }),
    worst = (f: Fit) => (g.only === 'light' ? f.light : g.only === 'dark' ? f.dark : Math.max(f.light, f.dark)),
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
          // Chrome mixes two of the same colour in oklch into one with no hue, which paints pink
          if (al === bl || ad === bd) continue;
          const grey = [al, ad, bl, bd].some(isGrey),
            mix = grey ? mixOklab : mixOklch;
          take(
            seen(
              [mix(al, bl, k), mix(ad, bd, k)],
              `color-mix(in ${grey ? 'oklab' : 'oklch'}, var(${a}) ${p}%, var(${b}))`,
            ),
          );
        }
  const best: Fit | null = nearest;
  return { fit: best && worst(best) <= limit ? best : null, nearest: best };
}

export function survey(rules: Rule[], prefix: RegExp, skip: Set<string>, allow: Set<string>) {
  const { light, dark, scoped } = tokenValues(rules),
    swaps = new Map<string, { value: string; rule: number }>(),
    groups = new Map<string, Group>(),
    uses: Use[] = [],
    valueIn = (token: string) => dark.get(token) ?? light.get(token),
    aimed = (t: string) => prefix.test(t) && !skip.has(t) && !scoped.has(t);
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
