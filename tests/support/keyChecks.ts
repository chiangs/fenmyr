// One behaviour check for each shortcut that moves, selects, arranges or changes cards or the view: press the keys on a
// real board and assert what changed. The ids are the ones in SHORTCUTS.
import assert from 'node:assert';
import type { Page } from 'playwright';
import type { Kit } from './keyKit.ts';

export type Check = () => Promise<void>;

export function boardChecks(page: Page, k: Kit): Record<string, Check> {
  const count = () => page.evaluate(() => window.__fenmyr.board.cards.length);
  const groups = () =>
    page.evaluate(() => Object.fromEntries(window.__fenmyr.board.cards.map(c => [c.id, c.group ?? null])));
  // the zoom after pressing the keys with the board zoomed to z
  const zoomFrom = async (z: number, keys: string) => {
    await k.reset();
    await k.setView({ x: 700, y: 400, z });
    await k.press(keys, 0);
    await k.still();
    return (await k.view()).z;
  };
  const inView = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#cards .card')].every(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      }),
    );
  // the cards' order after selecting some and pressing the keys
  const restacked = async (ids: string[], keys: string) => {
    await k.reset();
    await k.select(...ids);
    await k.press(keys);
    return (await k.order()).join('');
  };
  // Two deletes, each left to settle into its own undo step: the board is put back by the test, not by a change that undo
  // could know, so the steps to go back through are the ones the keys made.
  const twoDeletes = async () => {
    await k.reset();
    await k.select('a');
    await k.press(k.chord('delete'), 500);
    await k.select('b');
    await k.press(k.chord('delete'), 500);
  };
  const removed = async (keys: string) => {
    await k.reset();
    await k.select('a');
    await k.press(keys);
    return (await k.order()).join('');
  };

  return {
    pan: async () => {
      await k.reset();
      const spot = await k.emptySpot(),
        before = await k.view();
      await page.keyboard.down('Space');
      assert.ok(await k.has('#stage', 'space'), 'holding Space readies the board to pan');
      await page.mouse.move(spot.x, spot.y);
      await page.mouse.down();
      await page.mouse.move(spot.x + 120, spot.y + 40, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up('Space');
      const after = await k.view();
      assert.ok(
        Math.abs(after.x - before.x - 120) < 2 && Math.abs(after.y - before.y - 40) < 2,
        `Space and a drag pan the board by the drag: ${JSON.stringify([before, after])}`,
      );
      assert.ok(!(await k.has('#stage', 'space')), 'letting go of Space ends it');
    },
    zoomIn: async () => assert.ok((await zoomFrom(1, k.chord('zoomIn'))) > 1, 'zoom in zooms in'),
    zoomOut: async () => assert.ok((await zoomFrom(1, k.chord('zoomOut'))) < 1, 'zoom out zooms out'),
    zoom100: async () => assert.strictEqual(await zoomFrom(2, k.chord('zoom100')), 1, 'zoom to 100% goes to 100%'),
    zoomFit: async () => {
      const z = await zoomFrom(0.5, k.chord('zoomFit'));
      assert.ok(z > 0.6 && (await inView()), `zoom to fit shows all the cards in the window: ${z}`);
    },
    fitAll: async () => {
      await k.reset();
      await k.setView({ x: 3000, y: 2000, z: 0.5 });
      await k.press(k.chord('fitAll'), 700);
      assert.ok(await inView(), 'fitting brings every card into view');
    },

    selectAll: async () => {
      await k.reset();
      await k.press(k.chord('selectAll'));
      assert.deepStrictEqual([...(await k.selected())].sort(), ['a', 'b', 'c'], 'select all selects every card');
    },
    copy: async () => {
      await k.reset();
      await k.select('a');
      await k.press(k.chord('copy'));
      assert.strictEqual(await count(), 3, 'copy leaves the card where it is');
      await k.press(k.chord('paste'), 400);
      assert.strictEqual(await count(), 4, 'and paste then adds a copy of it');
    },
    cut: async () => {
      await k.reset();
      await k.select('b');
      await k.press(k.chord('cut'));
      assert.strictEqual((await k.order()).join(''), 'ac', 'cut takes the card off the board');
      await k.press(k.chord('paste'), 400);
      assert.strictEqual(await count(), 3, 'and paste brings it back');
    },
    paste: async () => {
      await k.reset();
      await k.select('c');
      await k.press(k.chord('copy'));
      await k.press(k.chord('paste'), 400);
      assert.strictEqual(await count(), 4, 'paste adds what was copied');
    },
    duplicate: async () => {
      await k.reset();
      await k.select('a');
      await k.press(k.chord('duplicate'));
      assert.strictEqual(await count(), 4, 'duplicate adds a copy');
      const [now] = await k.selected();
      assert.ok(now !== undefined && now !== 'a', 'and selects the copy, not the original');
    },
    delete: async () => {
      assert.strictEqual(await removed(k.chord('delete')), 'bc', 'Delete removes the selected card');
      assert.strictEqual(await removed('Backspace'), 'bc', 'and so does Backspace');
    },
    undo: async () => {
      await twoDeletes();
      await k.press(k.chord('undo'));
      assert.strictEqual((await k.order()).join(''), 'bc', 'undo brings back the card deleted last');
    },
    redo: async () => {
      await twoDeletes();
      await k.press(k.chord('undo'));
      await k.press(k.chord('redo'));
      assert.strictEqual((await k.order()).join(''), 'c', 'redo deletes it again');
    },

    group: async () => {
      await k.reset();
      await k.select('a', 'b');
      await k.press(k.chord('group'));
      const g = await groups();
      assert.ok(g.a && g.a === g.b && g.c === null, `group groups the selected cards: ${JSON.stringify(g)}`);
    },
    ungroup: async () => {
      await k.reset();
      await k.select('a', 'b');
      await k.press(k.chord('group'));
      await k.press(k.chord('ungroup'));
      const g = await groups();
      assert.ok(g.a === null && g.b === null, `ungroup takes them out of the group: ${JSON.stringify(g)}`);
    },
    section: async () => {
      await k.reset();
      await k.select('a', 'b');
      await k.press(k.chord('section'));
      const types = await page.evaluate(() => window.__fenmyr.board.cards.map(c => c.type));
      assert.strictEqual(types.filter(t => t === 'section').length, 1, 'create a section makes a section');
    },
    front: async () => assert.strictEqual(await restacked(['a'], k.chord('front')), 'bca', 'bring to front'),
    forward: async () => assert.strictEqual(await restacked(['a'], k.chord('forward')), 'bac', 'bring forward'),
    backward: async () => assert.strictEqual(await restacked(['b'], k.chord('backward')), 'bac', 'send backward'),
    back: async () => assert.strictEqual(await restacked(['c'], k.chord('back')), 'cab', 'send to back'),
  };
}
