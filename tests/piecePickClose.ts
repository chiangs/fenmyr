// The Pieces picker closes on Esc, ×, Pieces again, a press on the bare board or on chrome, a selection off its screen,
// its screen deleted or undone, and Home. A press on a piece in its screen and an undo of a pick keep it. The keyboard
// reaches it from F10 and moves through its grid, and the bar keeps clear of it.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
board.cards.push({ id: 'note', type: 'note', x: 0, y: -400, w: 220, h: 120, r: 0, color: 'white', text: 'a note' });
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;

const open = () => page.evaluate(() => !document.getElementById('piecePick')?.hidden);
const count = () => page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
const focus = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a instanceof HTMLElement ? a.id || a.dataset.pieces || a.dataset.pkPiece || a.dataset.pkTool || '' : '';
  });
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const openOn = async (id: string) => {
  await select([id]);
  if (!(await open())) await page.click('#selbar [data-pieces]');
  await settle(page, 250);
  assert.ok(await open(), `the picker opens on ${id}`);
};
const screenPoint = (id: string, fx: number, fy: number) =>
  page.evaluate(
    ([id, fx, fy]) => {
      const c = window.__fenmyr.curBoard()?.cards.find(c => c.id === id),
        v = window.__fenmyr.view,
        s = document.getElementById('stage')?.getBoundingClientRect();
      if (!c || !s) throw new Error(`no ${id}`);
      return { x: s.left + v.x + (c.x + c.w * fx) * v.z, y: s.top + v.y + (c.y + c.h * fy) * v.z };
    },
    [id, fx, fy] as const,
  );
// a spot on the board with nothing on it
const bare = () =>
  page.evaluate(() => {
    for (let y = 760; y > 100; y -= 30)
      for (let x = 280; x < 1150; x += 30)
        if (['grid', 'stage', 'world', 'cards'].includes(document.elementFromPoint(x, y)?.id ?? '')) return { x, y };
    throw new Error('no bare board in view');
  });
const closes = async (why: string, act: () => Promise<void>, on = 'signin') => {
  await openOn(on);
  await act();
  await settle(page, 250);
  assert.ok(!(await open()), `${why} closes the picker`);
};

try {
  await settle(page, 800);

  await openOn('signin');
  await page.fill('#pkSearch', 'abc');
  await page.press('#pkSearch', 'Escape');
  assert.deepStrictEqual(
    [await open(), await page.inputValue('#pkSearch')],
    [true, ''],
    'Esc with words clears them and keeps the picker',
  );
  await page.press('#pkSearch', 'Escape');
  await settle(page, 150);
  assert.deepStrictEqual(
    [await open(), await focus()],
    [false, 'signin'],
    'a second Esc closes it, back on Pieces after the bar redraws',
  );

  await closes('×', () => page.click('#piecePick [data-pk-close]'));
  await closes('Pieces again', () => page.click('#selbar [data-pieces]'));
  await closes('a press on the bare board', async () => {
    const p = await bare();
    await page.mouse.click(p.x, p.y);
  });
  await closes('a press on chrome', () => page.click('#tray .tray-head .label'));
  await closes('selecting a note', () => select(['note']));
  await closes(
    'deleting its screen',
    async () => {
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
      await page.keyboard.press('Delete');
    },
    'empty',
  );
  await page.keyboard.press('Control+z');
  await settle(page, 300);
  await closes('Home', () => page.evaluate(() => window.__fenmyr.openHome()));
  await page.keyboard.press('Escape');
  await settle(page, 400);

  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('w');
  await page.keyboard.press('Enter');
  await settle(page, 300);
  const made = await page.evaluate(() => window.__fenmyr.sel[0] ?? '');
  await closes(
    'undoing its screen',
    async () => {
      await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
      await page.keyboard.press('Control+z');
    },
    made,
  );

  await openOn('signin');
  const piece = await screenPoint('head0', 0.5, 0.5);
  await page.mouse.click(piece.x, piece.y);
  await settle(page, 250);
  assert.ok(await open(), 'a press on a piece in its screen keeps the picker');
  const held = await page.evaluate(() => window.__fenmyr.sel);
  await page.keyboard.press('Escape');
  assert.deepStrictEqual(
    [await open(), held.includes('head0'), await page.evaluate(() => window.__fenmyr.sel)],
    [false, true, held],
    'Esc on the board closes the picker before it clears the selection',
  );
  await openOn('signin');
  const before = await count();
  await page.click('#pkGrid [data-pk-piece="Divider"]');
  await settle(page, 300);
  await page.keyboard.press('Control+z');
  await settle(page, 300);
  assert.deepStrictEqual([await count(), await open()], [before, true], 'an undo of a pick keeps the picker');

  await page.click('#piecePick [data-pk-close]');
  await select(['signin']);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('F10');
  assert.strictEqual(await focus(), 'signin', 'F10 lands on Pieces, the bar’s first control');
  await page.keyboard.press('Enter');
  await settle(page, 250);
  assert.deepStrictEqual([await open(), await focus()], [true, 'pkSearch'], 'Enter opens the picker, in its search');
  const told = () =>
    page.evaluate(() => {
      const p = document.getElementById('piecePick');
      return [
        document.querySelector('#selbar [data-pieces]')?.getAttribute('aria-expanded'),
        p?.getAttribute('role'),
        p?.getAttribute('aria-label'),
        [...document.querySelectorAll('#piecePick [data-pk-view]')].map(b => b.getAttribute('aria-pressed')).join(),
      ];
    });
  await settle(page, 100);
  assert.deepStrictEqual(
    await told(),
    ['true', 'dialog', 'Pieces', 'true,false'],
    'a screen reader hears Pieces expanded, a dialog named Pieces, and which view is showing',
  );
  const keys: string[] = [];
  for (const k of ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(k);
    keys.push(await focus());
  }
  assert.deepStrictEqual(
    keys,
    ['box', 'text', 'Heading', 'Map', 'Video', 'text'],
    'Down enters the grid, and the arrows move by cell and by row',
  );
  await page.keyboard.press('ArrowUp');
  assert.strictEqual(await focus(), 'pkSearch', 'Up from the first row goes back to the search');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const n = await count();
  await page.keyboard.press('Enter');
  await settle(page, 300);
  const heading = await page.evaluate(() =>
    window.__fenmyr.curBoard()?.cards.some(c => c.type === 'text' && c.onFrame === 'signin' && c.text === 'Heading'),
  );
  assert.ok((await count()) > n && heading, 'Enter on a cell adds it to the screen');
  assert.ok(await open(), 'and the picker stays open');
  await page.keyboard.press('Escape');
  await settle(page, 150);
  assert.deepStrictEqual([await open(), await focus()], [false, 'signin'], 'Esc on a cell closes, back on Pieces');
  assert.strictEqual((await told())[0], 'false', 'and Pieces says it is collapsed');

  for (const [on, x, y, z] of [
    ['signin', 300, 40, 0.3],
    ['signin', 300, 40, 1],
    ['signin', 300, 40, 1.6],
    ['empty', 200, 60, 0.5],
    ['empty', 300, 30, 1],
  ] as const) {
    await page.evaluate(
      v => {
        Object.assign(window.__fenmyr.view, v);
        window.__fenmyr.applyView();
      },
      { x, y, z },
    );
    await openOn(on);
    await settle(page, 300);
    const r = await page.evaluate(() => {
      const a = document.getElementById('selbar')?.getBoundingClientRect(),
        b = document.getElementById('piecePick')?.getBoundingClientRect(),
        side = document.getElementById('sideR')?.firstElementChild?.getBoundingClientRect();
      return a && b && side ? { bar: a.toJSON(), pick: b.toJSON(), sideR: side.left } : null;
    });
    const apart =
      !!r &&
      (r.bar.right <= r.pick.left ||
        r.pick.right <= r.bar.left ||
        r.bar.bottom <= r.pick.top ||
        r.pick.bottom <= r.bar.top);
    assert.ok(apart, `at ${z * 100}% the bar keeps clear of the picker: ${JSON.stringify(r)}`);
    assert.ok(!!r && r.bar.right <= r.sideR, `at ${z * 100}% the bar folds to fit beside it: ${JSON.stringify(r)}`);
  }
  assert.deepStrictEqual(l.errors, []);
  console.log('PIECE PICK CLOSE OK');
} finally {
  await l.close();
}
