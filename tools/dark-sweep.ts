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
import { everyOfflineCard } from '../tests/fixtures/boards.ts';
import { launch } from '../tests/support/launch.ts';
import { freshRepo, openPrototype } from '../tests/support/prototype.ts';
import { parseRules } from './dark-css.ts';
import { diff, frames, LOOKS, type Look, prepare } from './dark-look.ts';

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

// a board with every card the app can make offline, and scenes that build on each other: the board with a note selected,
// then other cards selected, Settings over it, Myra's chat, a Doc open, and the home screen
const SELECTED = (id: string) => async (page: Page) => {
  await page.evaluate(card => window.__fenmyr.selectOnly([card]), id);
  await page.mouse.move(1439, 899);
};
// a popover opened from the selection bar (or from the document toolbar), with its card selected
const OPEN = (card: string, trigger: string) => async (page: Page) => {
  await page.keyboard.press('Escape');
  await SELECTED(card)(page);
  // a trigger the bar folds away (the More button on a narrow bar) is skipped: that scene just shows what is open
  await page
    .locator(`#selbar ${trigger}`)
    .first()
    .click({ timeout: 1500 })
    .catch(() => undefined);
};
const pops = (card: string, names: string[]) =>
  names.map(name => ({ name: `${card} ${name}`, run: OPEN(card, `[data-pop="${name}"]`) }));
const DOC_POPS = ['style', 'font', 'color', 'hl', 'align', 'link', 'more'];
const SCENES: { name: string; run: (page: Page) => Promise<void> }[] = [
  { name: 'board', run: SELECTED('note') },
  { name: 'text', run: SELECTED('text') },
  { name: 'shape', run: SELECTED('shape') },
  { name: 'todo', run: SELECTED('todo') },
  ...pops('note', ['tags', 'due', 'size', 'color', 'more']),
  { name: 'note tilt', run: OPEN('note', '.sb-tilt') },
  ...pops('text', ['type', 'tfill', 'place', 'stroke', 'more']),
  ...pops('box', ['fill', 'stroke', 'corners', 'place']),
  { name: 'settings', run: page => page.locator('#gearBtn').click() },
  {
    name: 'chat',
    run: async page => {
      await page.keyboard.press('Escape');
      await page.locator('#mPill').click();
    },
  },
  {
    name: 'doc',
    run: async page => {
      await page.keyboard.press('Escape');
      await page.locator('#cards [data-id="doc"]').dblclick();
      await page.waitForSelector('.dv-prose', { timeout: 8000 });
    },
  },
  ...DOC_POPS.map(name => ({
    name: `doc ${name}`,
    run: async (page: Page) => {
      await page
        .locator(`.dt-b[data-pop="${name}"]`)
        .first()
        .click({ timeout: 1500 })
        .catch(() => undefined);
    },
  })),
  {
    name: 'prototype',
    run: async page => {
      await page.keyboard.press('Escape');
      await openPrototype(page, freshRepo('fenmyr-sweep-').repo);
      await page.waitForSelector('#prGit', { timeout: 8000 });
    },
  },
  {
    name: 'home',
    run: async page => {
      await page.keyboard.press('Escape');
      await page.locator('#homeBtn').click();
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

async function sweepLook(look: Look, targets: Target[], seen: Map<string, number>) {
  const values: Record<string, string> = {};
  // a chat with a line each way, and buttons under hers, for the rules about Myra's messages
  const local = (ms: number) => {
    const t = new Date(Date.now() + ms);
    const two = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}T${two(t.getHours())}:${two(t.getMinutes())}`;
  };
  const every = everyOfflineCard();
  // the same cards in a colour, since a rule for "every doc" or "every link" can matter only on a card that is not white
  const tinted = every.cards
    .filter(c =>
      ['note', 'todo', 'doc', 'link', 'audio', 'canvas', 'swatch', 'image', 'font', 'vnote'].includes(c.type),
    )
    .map((c, i) => ({ ...c, id: `${c.id}-sky`, color: 'sky', x: c.x + 1400, y: c.y + i * 4 }));
  const base = { ...every, cards: [...every.cards, ...tinted] };
  const dueNote = (id: string, x: number, due: string) => ({ ...base.cards[1], id, x, y: 900, due });
  const board = {
    ...base,
    cards: [
      ...base.cards,
      dueNote('due-later', 0, local(40 * 864e5)),
      dueNote('due-soon', 260, local(36e5)),
      dueNote('due-over', 520, local(-864e5)),
    ],
    chat: [
      { who: 'me', text: 'What should this board show?', t: 1 },
      {
        who: 'myra',
        text: 'A first screen, I think.',
        t: 2,
        acts: [
          { kind: 'next', text: 'Find onboarding screens' },
          { kind: 'source', card: 'note' },
        ],
      },
    ],
  };
  const app = await launch({ boards: [board], open: board.id, settings: look.settings });
  try {
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
  } finally {
    await app.close();
  }
  return values;
}

async function snapshot(out: string, args: string[]) {
  const { css, only } = parseFilters(args);
  const targets = targetsOf(fs.readFileSync(css, 'utf8'), only);
  const values: Record<string, string> = {};
  const seen = new Map<string, number>(targets.map(t => [t.id, 0]));
  for (const look of LOOKS) {
    // a scene that times out is retried on a fresh launch: the app, not the stylesheet, was slow
    for (let attempt = 1; ; attempt++) {
      try {
        Object.assign(values, await sweepLook(look, targets, seen));
        break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
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
