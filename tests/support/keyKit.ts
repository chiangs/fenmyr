// A board for the shortcut tests, and what they press, read and put back in the page between one shortcut and the next.
import type { Page } from 'playwright';
import { SHORTCUTS } from '../../src/web/input/keymap.ts';

const note = (id: string, x: number, text: string) => ({
  id,
  type: 'note',
  x,
  y: -60,
  w: 220,
  h: 120,
  r: 0,
  color: 'butter',
  name: '',
  text,
});

export const BOARD = {
  id: 'keys',
  name: 'Keys',
  cards: [note('a', -330, 'alpha one'), note('b', -80, 'alpha two'), note('c', 170, 'gamma')],
  links: [],
  tray: [],
  view: { x: 700, y: 400, z: 1 },
};

const MODIFIERS: Record<string, string> = { '⌃': 'Control', '⌘': 'Control', '⌥': 'Alt', '⇧': 'Shift' };
const NAMED: Record<string, string> = {
  Esc: 'Escape',
  '−': 'Minus',
  '=': 'Equal',
  ',': 'Comma',
  '.': 'Period',
  '\\': 'Backslash',
  '[': 'BracketLeft',
  ']': 'BracketRight',
};

// The keys a shortcut lists, in Mac symbols, as the chord a test presses: ⇧⌘Z is Control+Shift+z.
function chordOf(keys: string) {
  const held = ['Control', 'Alt', 'Shift'].filter(m => [...keys].some(c => MODIFIERS[c] === m)),
    rest = keys.replace(/[⌃⌥⇧⌘]/g, ''),
    key = NAMED[rest] ?? (/^\d$/.test(rest) ? `Digit${rest}` : rest.length === 1 ? rest.toLowerCase() : rest);
  return [...held, key].join('+');
}

export type Kit = Awaited<ReturnType<typeof kit>>;

export async function kit(page: Page) {
  // the board as it opened, as the page holds it, so a reset puts back exactly that
  const opened = await page.evaluate(() => ({
    cards: JSON.stringify(window.__fenmyr.board.cards),
    view: JSON.stringify(window.__fenmyr.view),
  }));
  // the chord for a shortcut's entry: a check presses the keys the list shows
  const chord = (id: string) => {
    const entry = SHORTCUTS.find(s => s.id === id);
    if (!entry) throw new Error(`no shortcut ${id}`);
    return chordOf(entry.keys);
  };
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const still = async () => {
    await page.waitForFunction(() => !document.getElementById('stage')?.classList.contains('moving'));
    await frames();
  };
  const press = async (keys: string, wait = 150) => {
    await page.keyboard.press(keys);
    await page.waitForTimeout(wait);
  };
  const select = async (...ids: string[]) => {
    await page.evaluate(ids => window.__fenmyr.selectOnly(ids), ids);
    await frames();
  };
  const setView = async (v: { x: number; y: number; z: number }) => {
    await page.evaluate(v => {
      Object.assign(window.__fenmyr.view, v);
      window.__fenmyr.applyView();
    }, v);
    await frames();
  };
  const view = () => page.evaluate(() => ({ ...window.__fenmyr.view }));
  const order = () => page.evaluate(() => window.__fenmyr.board.cards.map(c => c.id));
  const selected = () => page.evaluate(() => window.__fenmyr.sel);
  const has = (selector: string, cls: string) =>
    page.evaluate(([s, c]) => !!document.querySelector(s)?.classList.contains(c ?? ''), [selector, cls] as const);
  // a point on bare board, clear of the cards, the panels and the bars
  const emptySpot = () =>
    page.evaluate(() => {
      for (let y = 560; y < innerHeight - 120; y += 20)
        for (let x = 320; x < innerWidth - 320; x += 20)
          if (document.elementFromPoint(x, y)?.id === 'stage') return { x, y };
      throw new Error('no bare board');
    });
  // Takes the board back to how it opened and closes whatever the last shortcut left open.
  const reset = async () => {
    await page.evaluate(() => {
      for (const id of ['mcClose', 'fbX']) {
        const b = document.getElementById(id);
        if (b?.checkVisibility()) b.click();
      }
    });
    for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
    await page.evaluate(({ cards, view }) => {
      const f = window.__fenmyr;
      f.board.cards.splice(0, f.board.cards.length, ...JSON.parse(cards));
      Object.assign(f.view, JSON.parse(view));
      f.applyView();
      f.renderAll();
      f.selectOnly([]);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }, opened);
    await frames();
  };
  return { chord, frames, still, press, select, setView, view, order, selected, has, emptySpot, reset };
}
