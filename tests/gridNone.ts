// Grid shape is the one setting for how the board's grid looks, and None is one of its values, so there is no Dot grid switch to
// disagree with it. Each of the seven options is picked through the real picker, and the board's grid and the saved setting
// must say the same thing. An old save with the grid switched off opens with None.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { launch } from './support/launch.ts';

const IDS = ['none', 'dot', 'cross', 'square', 'cloudberry', 'berry', 'leaf'];
const NAMES = ['None', 'Dots', 'Crosses', 'Squares', 'Cloudberries', 'Berries', 'Leaves'];
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

// how the board's grid, the picker and the saved setting each show the shape
const read = (page: Page) =>
  page.evaluate(() => {
    const grid = document.getElementById('grid');
    if (!grid) throw new Error('the board grid is missing');
    const board = getComputedStyle(grid),
      saved = JSON.parse(localStorage.getItem('fenmyr:settings') || '{}');
    const buttons = [...document.querySelectorAll<HTMLElement>('#gridShapes button')];
    return {
      boardDisplay: board.display,
      boardMask: board.maskImage,
      boardVar: grid.style.getPropertyValue('--gm'),
      picked: buttons.filter(b => b.classList.contains('on')).map(b => b.dataset.gshape),
      glyphs: Object.fromEntries(
        buttons.map(b => [b.dataset.gshape, b.querySelector('i')?.style.getPropertyValue('--gm') ?? '']),
      ),
      ids: buttons.map(b => b.dataset.gshape),
      names: buttons.map(b => b.getAttribute('aria-label')),
      saved: saved.gridShape,
      savedGrid: 'grid' in saved,
    };
  });

const l = await launch({ boards: [board], open: 'b' });
try {
  const { page } = l;
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="appearance"]');

  const first = await read(page);
  assert.deepStrictEqual(first.ids, IDS, 'the picker offers None first, then the six shapes');
  assert.deepStrictEqual(first.names, NAMES, 'each button is named for what it draws, None included');
  assert.strictEqual(await page.locator('#settings [data-set="grid"]').count(), 0, 'there is no Dot grid switch');
  assert.deepStrictEqual(first.picked, ['dot'], 'a new profile has Dots picked');

  for (const id of IDS) {
    await page.click(`#gridShapes [data-gshape="${id}"]`);
    const s = await read(page);
    assert.deepStrictEqual(s.picked, [id], `${id}: its button is the one picked`);
    assert.strictEqual(s.saved, id, `${id}: the choice is saved`);
    assert.strictEqual(s.savedGrid, false, `${id}: nothing is saved for a separate grid switch`);
    if (id === 'none') {
      assert.strictEqual(s.boardDisplay, 'none', 'none: the board draws no grid');
    } else if (id === 'dot') {
      assert.notStrictEqual(s.boardDisplay, 'none', 'dot: the board draws its grid');
      assert.strictEqual(s.boardMask, 'none', 'dot: as plain dots, with no mask');
    } else {
      assert.notStrictEqual(s.boardDisplay, 'none', `${id}: the board draws its grid`);
      assert.match(s.boardMask, /^url\(/, `${id}: through a mask`);
      assert.strictEqual(s.glyphs[id], s.boardVar, `${id}: and its button draws that shape too`);
    }
  }
  assert.deepStrictEqual(l.errors, [], 'no page errors');
} finally {
  await l.close();
}

// what an older version saved, and what is not a shape at all
const opens = async (settings: Record<string, unknown>) => {
  const o = await launch({ boards: [board], open: 'b', settings });
  try {
    await o.page.click('#gearBtn');
    await o.page.click('#setTabs [data-tab="appearance"]');
    return await read(o.page);
  } finally {
    await o.close();
  }
};
const off = await opens({ grid: false });
assert.strictEqual(off.boardDisplay, 'none', 'a save with the grid off opens with no grid');
assert.deepStrictEqual(off.picked, ['none'], 'and None picked');
assert.strictEqual(off.saved, 'none', 'and keeps it as None');
assert.strictEqual(off.savedGrid, false, 'and drops the old switch');
const hidden = await opens({ grid: false, gridShape: 'cross' });
assert.strictEqual(
  hidden.boardDisplay,
  'none',
  'the grid stays off when a shape was saved with it, as the old switch hid it',
);
assert.deepStrictEqual(hidden.picked, ['none'], 'so None is picked');
const shown = await opens({ grid: true, gridShape: 'cross' });
assert.deepStrictEqual(shown.picked, ['cross'], 'a saved shape is read back');
assert.match(shown.boardMask, /^url\(/, 'and drawn');
const odd = await opens({ gridShape: 'hexagon' });
assert.deepStrictEqual(odd.picked, ['dot'], 'a saved shape that does not exist falls back to Dots');
assert.notStrictEqual(odd.boardDisplay, 'none', 'and the grid is drawn');

// one place says what each shape looks like
const { GRID_SHAPES, gridLook } = await import('../src/web/canvas/gridLook.ts');
assert.deepStrictEqual([...GRID_SHAPES], IDS, 'the shapes, None first');
assert.deepStrictEqual(gridLook('none'), { visible: false, mask: null }, 'none draws nothing');
assert.deepStrictEqual(gridLook('dot'), { visible: true, mask: null }, 'dots are plain, with no mask');
const masks = new Set<string>();
for (const id of GRID_SHAPES.slice(2)) {
  const look = gridLook(id);
  assert.strictEqual(look.visible, true, `${id} is drawn`);
  assert.match(look.mask ?? '', /^url\(/, `${id} has a mask`);
  masks.add(look.mask ?? '');
}
assert.strictEqual(masks.size, 5, 'and each shape has its own');
console.log('gridNone: ok');
