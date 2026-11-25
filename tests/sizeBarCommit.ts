// A value typed in the size dropdown is applied once, however the dropdown closes: Enter commits it, and the blur as
// the dropdown closes finds nothing left to commit. A screen in a collection stays where the collection puts it, and
// so does what sits on it.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const piece = (id: string, onFrame: string, x: number, y: number) => ({
  id,
  type: 'box',
  x,
  y,
  w: 160,
  h: 100,
  r: 0,
  color: 'white',
  onFrame,
  fill: '#e4e4e7',
});
board.cards.push(
  piece('fbox', 'empty', 510, 100),
  {
    id: 'col',
    type: 'coll',
    x: 2600,
    y: 0,
    w: 300,
    h: 300,
    r: 0,
    color: 'white',
    kids: ['cscr'],
    cols: 1,
    title: 'Shelf',
  },
  {
    id: 'cscr',
    type: 'frame',
    x: 2620,
    y: 60,
    w: 393,
    h: 852,
    r: 0,
    device: 'iPhone',
    color: 'white',
    radius: 44,
    name: 'In shelf',
    fill: '#ffffff',
  },
);
// the picker that selecting a screen opens would fold its device dropdown into ···, and this types in that dropdown
const l = await launch({ boards: [board], open: 'wire', settings: { autoPieces: false } });
const { page } = l;

const card = (id: string) =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    if (!c) throw new Error(`no card ${i}`);
    return { x: c.x, y: c.y, onFrame: c.onFrame };
  }, id);
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const typeEnter = async (field: string, value: string) => {
  await page.click('#selbar [data-pop="place"]');
  await page.waitForTimeout(150);
  await page.fill(`#selbar [data-size="${field}"]`, value);
  await page.keyboard.press('Enter');
  await settle(page, 250);
};

try {
  await settle(page, 800);
  // counts each time the box's x is set, which is each time a typed X is applied to it
  await page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'fbox');
    if (!c) throw new Error('no box');
    let x = c.x;
    Object.assign(window, { xSets: 0 });
    Object.defineProperty(c, 'x', {
      enumerable: true,
      get: () => x,
      set: v => {
        x = v;
        Object.assign(window, { xSets: Number(Reflect.get(window, 'xSets')) + 1 });
      },
    });
  });
  await select(['fbox']);
  await typeEnter('x', '600.4');
  assert.deepStrictEqual(
    [(await card('fbox')).x, await page.evaluate(() => Reflect.get(window, 'xSets'))],
    [600, 1],
    'Enter applies a typed X once, though the box rounds it',
  );

  // a piece on the screen that isn't one of the collection's cards, as one added from Pieces is
  const added = 'cpiece';
  await page.evaluate(() => {
    const b = window.__fenmyr.curBoard(),
      s = b?.cards.find(c => c.id === 'cscr');
    if (!b || !s) throw new Error('no screen in the collection');
    b.cards.push({
      id: 'cpiece',
      type: 'box',
      x: s.x + 40,
      y: s.y + 100,
      w: 160,
      h: 100,
      r: 0,
      color: 'white',
      onFrame: 'cscr',
      fill: '#e4e4e7',
    });
    window.__fenmyr.renderAll();
  });
  await settle(page, 400);
  await select(['cscr']);
  const before = { screen: await card('cscr'), piece: await card(added) };
  await typeEnter('x', String(before.screen.x + 300));
  assert.deepStrictEqual(
    { screen: await card('cscr'), piece: await card(added) },
    before,
    'a screen in a collection stays where the collection puts it, and so does what sits on it',
  );
  await page.click('#selbar [data-pop="place"]');
  await page.waitForTimeout(150);
  assert.strictEqual(
    await page.inputValue('#selbar [data-size="x"]'),
    String(before.screen.x),
    'and its X field shows where it is',
  );

  assert.deepStrictEqual(l.errors, [], 'no page errors');
  console.log('SIZE BAR COMMIT OK');
} finally {
  await l.close();
}
