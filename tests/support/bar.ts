// A board for the selection bar's tests, and what they read and do in the page.
import assert from 'node:assert';
import { launch } from './launch.ts';

const at = (id: string, type: string, x: number, y: number, w: number, h: number, more = {}) => ({
  id,
  type,
  x,
  y,
  w,
  h,
  r: 0,
  color: 'white',
  ...more,
});
const board = {
  id: 'bar',
  name: 'Bar',
  cards: [
    at('title', 'title', 0, -200, 320, 50, { text: 'A title' }),
    at('note', 'note', 0, 0, 220, 140, { name: '', text: 'Plan the week', rich: true, color: 'butter' }),
    at('pic', 'image', 400, 0, 260, 220, { src: 'stamps/myra-happy.png' }),
    at('wf', 'box', 800, 0, 160, 100),
    at('tall', 'note', 1200, -1000, 220, 2400, { name: '', text: 'Tall' }),
    at('ha', 'note', 0, 600, 120, 80, { name: '', text: 'a' }),
    at('hb', 'note', 500, 600, 120, 80, { name: '', text: 'b' }),
    at('va', 'note', 900, 500, 120, 80, { name: '', text: 'c' }),
    at('vb', 'note', 900, 1000, 120, 80, { name: '', text: 'd' }),
  ],
  links: [
    { id: 'h', a: 'ha', b: 'hb', bend: 0 },
    { id: 'v', a: 'va', b: 'vb', bend: 0 },
  ],
  tray: [],
  view: { x: 0, y: 0, z: 1 },
};

export type Edges = { l: number; t: number; r: number; b: number };

export async function openBar() {
  const l = await launch({ boards: [board], open: 'bar' });
  const { page } = l;
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const still = async () => {
    await page.waitForFunction(() => !document.getElementById('stage')?.classList.contains('moving'));
    await frames();
  };
  const view = async (x: number, y: number, z = 1) => {
    await page.evaluate(
      v => {
        Object.assign(window.__fenmyr.view, v);
        window.__fenmyr.applyView();
      },
      { x, y, z },
    );
    await still();
  };
  const select = async (ids: string[]) => {
    await page.evaluate(ids => window.__fenmyr.selectOnly(ids), ids);
    await frames();
  };
  const selectWire = async (id: string) => {
    await page.evaluate(id => window.__fenmyr.selectWire(id), id);
    await frames();
  };
  const cardOf = (id: string) =>
    page.evaluate(id => {
      const c = window.__fenmyr.board.cards.find(c => c.id === id);
      return c ? { x: c.x, h: c.h, cropEdit: 'cropEdit' in c, bold: 'bold' in c && !!c.bold } : null;
    }, id);
  const focused = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      if (!(a instanceof HTMLElement)) return null;
      if (a.closest('#selbar'))
        return `bar:${a.dataset.ts ?? a.dataset.pop ?? a.dataset.sb ?? a.dataset.crop ?? a.dataset.wb ?? a.tagName}`;
      return a.closest('.card')?.getAttribute('data-id') ?? a.tagName;
    });
  // the bar, a card and the turn dot on screen, and the edges of what covers the board
  const shape = (id = '') =>
    page.evaluate(id => {
      const edges = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom };
      };
      const bar = document.getElementById('selbar'),
        dot = document.getElementById('mrot'),
        widgets = (side: string) =>
          [...(document.getElementById(side)?.children ?? [])].filter(c => c.checkVisibility()),
        header = [document.querySelector('.top'), document.getElementById('saved')];
      return {
        bar: edges(bar),
        shown: !!bar?.checkVisibility({ opacityProperty: true }),
        inDock: !!bar?.closest('#dock'),
        tools: !!document.getElementById('tools')?.checkVisibility(),
        card: edges(document.querySelector(`#cards [data-id="${id}"]`)),
        dot: dot?.checkVisibility() ? edges(dot) : null,
        leftWidgets: Math.max(...widgets('side').map(w => w.getBoundingClientRect().right)),
        header: Math.max(...header.map(h => h?.getBoundingClientRect().bottom ?? 0)),
      };
    }, id);
  const failed: string[] = [];
  // each check reports on its own, so a run against an older build lists every check it fails
  const check = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (e) {
      failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    await page.mouse.up();
    await page.keyboard.up('Space');
    await page.keyboard.up('Control');
  };
  const done = async (ok: string) => {
    const errors = [...l.errors];
    await l.close();
    for (const f of failed) console.log(`FAILED ${f}`);
    assert.deepStrictEqual(failed, [], 'every check passes');
    assert.deepStrictEqual(errors, []);
    console.log(ok);
  };
  return { l, page, frames, still, view, select, selectWire, cardOf, focused, shape, check, done };
}

export const near = (actual: number | undefined, expected: number, what: string) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) <= 1, `${what}: ${actual} is not ${expected}`);
