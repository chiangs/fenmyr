// A board file written by hand, with no card list and no tray, opens as an empty board instead of failing to load.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 200, h: 100, r: 0, text: 'x' },
  app = await launch({
    boards: [
      { id: 'b', name: 'Normal', cards: [note], links: [], tray: [] },
      { id: 'h', name: 'Hand-written' },
    ],
    open: 'b',
  });
await app.page.evaluate(() => window.__fenmyr.openBoard('h'));
await app.page.waitForTimeout(500);
const opened = await app.page.evaluate(() => {
  const b = window.__fenmyr.curBoard();
  return b ? { cards: Array.isArray(b.cards), tray: Array.isArray(b.tray), name: b.name } : null;
});
assert.deepStrictEqual(opened, { cards: true, tray: true, name: 'Hand-written' }, 'the board opens with empty lists');
assert.deepStrictEqual(app.errors, [], 'opening it throws nothing');
await app.close();
console.log('BOARD LISTS OK');
