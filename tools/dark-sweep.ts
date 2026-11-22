// Reads what every body.dark rule styles, element by element, in every look. For each rule it takes the selector without
// `body.dark`, finds the elements that selector names in a few scenes of the running app (the board, Settings open,
// Myra's chat open), forces the hover and focus the selector asks for, and records the colours the rule declares. Run it
// before a fold and after, on the same rules: a rival rule that starts to win shows as a changed value.
//   git show origin/main:web/style.css > base.css
//   npm run build && node tools/dark-sweep.ts snapshot before.json --css base.css [--lines 100-400] [--match text]
//   (change the stylesheet) npm run build && node tools/dark-sweep.ts snapshot after.json --css base.css [same filters]
//   node tools/dark-sweep.ts diff before.json after.json
// --css names the rules to read, so both runs read the same ones. A rule whose element no scene shows is BLIND: snapshot
// lists it and exits 1, because nothing was proven for it. tools/dark-probe.ts covers what a sweep can't reach (the range
// track's pseudo-element, a state a scene doesn't set up); leave those out with --lines or --match.
import fs from 'node:fs';
import type { Page } from 'playwright';
import { launch } from '../tests/support/launch.ts';
import { parseRules } from './dark-css.ts';
import { BOARD, diff, frames, LOOKS, prepare } from './dark-look.ts';

declare global {
  interface Window {
    __sweepPaint: (value: string) => string;
  }
}

type Target = { id: string; sel: string; pseudo: string; states: string[]; props: string[] };

const FORCED = ['hover', 'focus-visible', 'focus-within', 'focus', 'active'];
const PSEUDO_ELEMENT =
  /::?(?:before|after|placeholder|selection|first-line|first-letter|marker|backdrop|-webkit-[\w-]+(?:\([^)]*\))?)$/;
const STATE = new RegExp(`:(${FORCED.join('|')})(?![\\w-])`, 'g');
const SIDES = ['top', 'right', 'bottom', 'left'];
// the longhands that show what a declaration paints
const READ: Record<string, string[]> = {
  background: ['background-color', 'background-image'],
  'background-color': ['background-color'],
  'background-image': ['background-image'],
  color: ['color'],
  border: [...SIDES.map(s => `border-${s}-color`), 'border-top-width'],
  'border-color': SIDES.map(s => `border-${s}-color`),
  ...Object.fromEntries(SIDES.flatMap(s => [`border-${s}`, `border-${s}-color`].map(k => [k, [`border-${s}-color`]]))),
  outline: ['outline-color'],
  'outline-color': ['outline-color'],
  'box-shadow': ['box-shadow'],
  'text-shadow': ['text-shadow'],
  fill: ['fill'],
  stroke: ['stroke'],
  'caret-color': ['caret-color'],
  opacity: ['opacity'],
  filter: ['filter'],
  'backdrop-filter': ['backdrop-filter'],
};

function targetsOf(css: string, only: (line: number, selector: string) => boolean): Target[] {
  return parseRules(css).flatMap(rule => {
    const props = [...new Set(rule.decls.flatMap(d => READ[d.prop] ?? []))];
    if (!props.length) return [];
    return rule.selectors.flatMap(selector => {
      if (!selector.startsWith('body.dark ') || !only(rule.line, selector)) return [];
      const rest = selector.slice('body.dark '.length);
      const pseudo = rest.match(PSEUDO_ELEMENT)?.[0] ?? '';
      const states = FORCED.filter(s => new RegExp(`:${s}(?![\\w-])`).test(rest));
      const sel = rest.replace(PSEUDO_ELEMENT, '').replace(STATE, '');
      return [{ id: `@${rule.line} ${selector}`, sel, pseudo, states, props }];
    });
  });
}

// scenes build on each other: the board, then Settings over it, then Myra's chat
const SCENES: { name: string; run: (page: Page) => Promise<void> }[] = [
  {
    name: 'board',
    run: async page => {
      await page.evaluate(() => window.__fenmyr.selectOnly(['a']));
      await page.mouse.move(1439, 899);
    },
  },
  { name: 'settings', run: page => page.locator('#gearBtn').click() },
  {
    name: 'chat',
    run: async page => {
      await page.keyboard.press('Escape');
      await page.locator('#mPill').click();
    },
  },
];

// reads the colours every target paints in its first elements, in the state the page is in
const readPlain = (targets: Pick<Target, 'id' | 'sel' | 'pseudo' | 'props'>[]) => {
  const out: Record<string, string> = {};
  for (const t of targets) {
    let els: Element[] = [];
    try {
      els = [...document.querySelectorAll(t.sel)];
    } catch {
      out[`${t.id} | selector`] = 'invalid';
      continue;
    }
    out[`${t.id} | elements`] = String(els.length);
    els.slice(0, 3).forEach((el, i) => {
      const style = getComputedStyle(el, t.pseudo || null);
      for (const p of t.props) out[`${t.id} #${i} | ${p}`] = window.__sweepPaint(style.getPropertyValue(p));
    });
  }
  return out;
};

// marks the first elements of a target and their ancestors, so the debugger can force hover or focus on all of them
const mark = (sel: string) => {
  for (const old of document.querySelectorAll('[data-sweep]')) old.removeAttribute('data-sweep');
  const els = [...document.querySelectorAll(sel)].slice(0, 3);
  els.forEach((el, i) => {
    el.setAttribute('data-sweep-i', String(i));
    for (let a: Element | null = el; a; a = a.parentElement) a.setAttribute('data-sweep', '');
  });
  return els.length;
};
const readMarked = ({ pseudo, props, id }: { pseudo: string; props: string[]; id: string }) => {
  const out: Record<string, string> = {};
  for (const el of document.querySelectorAll('[data-sweep-i]')) {
    const style = getComputedStyle(el, pseudo || null);
    const i = el.getAttribute('data-sweep-i');
    for (const p of props) out[`${id} #${i} | ${p}`] = window.__sweepPaint(style.getPropertyValue(p));
    el.removeAttribute('data-sweep-i');
  }
  return out;
};

async function sweepScene(page: Page, targets: Target[]) {
  const out: Record<string, string> = await page.evaluate(
    readPlain,
    targets.filter(t => !t.states.length),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  for (const t of targets.filter(t => t.states.length)) {
    const n = await page.evaluate(mark, t.sel).catch(() => -1);
    out[`${t.id} | elements`] = String(Math.max(n, 0));
    if (n < 1) continue;
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-sweep]' });
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: t.states });
    Object.assign(out, await page.evaluate(readMarked, t));
    for (const nodeId of nodeIds) await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  }
  await cdp.detach();
  return out;
}

function parseFilters(args: string[]) {
  const flag = (name: string) => args[args.indexOf(name) + 1];
  const css = args.includes('--css') ? (flag('--css') ?? 'web/style.css') : 'web/style.css';
  const ranges = (args.includes('--lines') ? (flag('--lines') ?? '') : '')
    .split(',')
    .filter(Boolean)
    .map(r => r.split('-').map(Number));
  const match = args.includes('--match') ? flag('--match') : undefined;
  const only = (line: number, selector: string) =>
    (!ranges.length || ranges.some(([a = 0, b = a]) => line >= a && line <= b)) && (!match || selector.includes(match));
  return { css, only };
}

async function snapshot(out: string, args: string[]) {
  const { css, only } = parseFilters(args);
  const targets = targetsOf(fs.readFileSync(css, 'utf8'), only);
  const values: Record<string, string> = {};
  const seen = new Map<string, number>(targets.map(t => [t.id, 0]));
  for (const look of LOOKS) {
    const app = await launch({ boards: [BOARD], open: 'p', settings: look.settings });
    await prepare(app.page);
    await app.page.evaluate(() => {
      window.__sweepPaint = v =>
        v.replace(/(?:oklch|oklab|lab|lch|hsla?|hwb|color)\((?:[^()]|\([^()]*\))*\)/g, c => {
          const [r, g, b, a] = window.__paint(c);
          return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
        });
    });
    for (const scene of SCENES) {
      await scene.run(app.page);
      await frames(app.page);
      for (const [k, v] of Object.entries(await sweepScene(app.page, targets))) {
        values[`${look.name} | ${scene.name} | ${k}`] = v;
        const id = k.split(' | ')[0]?.replace(/ #\d+$/, '') ?? '';
        if (k.endsWith(' | elements')) seen.set(id, Math.max(seen.get(id) ?? 0, Number(v)));
      }
    }
    await app.close();
  }
  fs.writeFileSync(out, `${JSON.stringify(values, null, 1)}\n`);
  const blind = [...seen].filter(([, n]) => n === 0).map(([id]) => id);
  console.log(
    `SWEEP: ${targets.length - blind.length} of ${targets.length} rules found elements, ${Object.keys(values).length} values written to ${out}`,
  );
  if (blind.length) {
    console.log(`BLIND: no element in any scene for\n  ${blind.join('\n  ')}`);
    process.exit(1);
  }
}

const [command, a, b, ...rest] = process.argv.slice(2);
if (command === 'snapshot' && a) await snapshot(a, [b ?? '', ...rest].filter(Boolean));
else if (command === 'diff' && a && b) diff(a, b);
else
  throw new Error(
    'node tools/dark-sweep.ts snapshot out.json --css base.css [--lines 1-9] [--match text]  |  node tools/dark-sweep.ts diff before.json after.json',
  );
