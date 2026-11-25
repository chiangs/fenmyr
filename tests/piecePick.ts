// Selecting a screen opens a picker beside it. Pieces, in the bar for a screen or anything on one, opens it too. It
// holds every piece under four headings with a thumbnail each, finds pieces by search, adds each into its screen under
// the lowest piece, and stays open across picks. Each pick is its own undo step, and the Box and Text cells put R's and X's tools in hand.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
board.cards.push(
  { id: 'note', type: 'note', x: 0, y: -400, w: 220, h: 120, r: 0, color: 'white', text: 'a note' },
  { id: 'loose', type: 'box', x: 600, y: -400, w: 160, h: 100, r: 0, color: 'white', fill: '#e4e4e7' },
);
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;

type Box = { id: string; type: string; x: number; y: number; w: number; h: number; onFrame?: string; group?: string };
const cards = (): Promise<Box[]> =>
  page.evaluate(() =>
    (window.__fenmyr.curBoard()?.cards ?? []).map(c => ({
      id: c.id,
      type: c.type,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      onFrame: c.onFrame,
      group: c.group,
    })),
  );
const card = async (id: string) => {
  const c = (await cards()).find(c => c.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const piecesShown = () =>
  page.evaluate(() => {
    const b = document.querySelector('#selbar.on [data-pieces]');
    return b instanceof HTMLElement && b.checkVisibility() ? b.previousElementSibling?.className : null;
  });
const picker = () =>
  page.evaluate(() => {
    const p = document.getElementById('piecePick');
    return {
      open: !!p && !p.hidden,
      focus: document.activeElement?.id ?? document.activeElement?.className ?? '',
      rect: p?.getBoundingClientRect().toJSON(),
    };
  });
const visible = (sel = '[data-pk-piece]') =>
  page.evaluate(
    s =>
      [...document.querySelectorAll(`#pkGrid ${s}`)]
        .filter(b => b instanceof HTMLElement && !b.hidden && b.checkVisibility())
        .map(b => (b instanceof HTMLElement ? (b.dataset.pkPiece ?? b.dataset.pkTool ?? b.dataset.pkIcon) : '')),
    sel,
  );
const search = async (words: string) => {
  await page.fill('#pkSearch', words);
  await page.waitForTimeout(60);
};
const toScreen = (c: Box) =>
  page.evaluate(
    b => {
      const v = window.__fenmyr.view,
        s = document.getElementById('stage')?.getBoundingClientRect();
      const l = (s?.left ?? 0) + v.x + b.x * v.z,
        t = (s?.top ?? 0) + v.y + b.y * v.z;
      return { l, t, r: l + b.w * v.z, b: t + b.h * v.z };
    },
    { x: c.x, y: c.y, w: c.w, h: c.h },
  );
const inside = (c: Box, f: Box) =>
  c.onFrame === f.id && c.x >= f.x - 1 && c.y >= f.y - 1 && c.x + c.w <= f.x + f.w + 1 && c.y + c.h <= f.y + f.h + 1;
const made = async (before: Box[]) => {
  const ids = new Set(before.map(c => c.id));
  return (await cards()).filter(c => !ids.has(c.id));
};

try {
  await settle(page, 800);
  for (const [ids, shows, why] of [
    [['signin'], true, 'a screen'],
    [['nav0'], true, 'a piece on a screen'],
    [['signin', 'nav0'], true, 'a screen with its own piece'],
    [['note'], false, 'a note'],
    [['loose'], false, 'a piece on the bare board'],
    [['signin', 'empty'], false, 'two screens'],
    [[], false, 'nothing'],
  ] as const) {
    await select([...ids]);
    const label = await piecesShown();
    assert.strictEqual(label !== null, shows, `Pieces shows for ${why}: ${shows}`);
    if (shows) assert.strictEqual(label, 'sb-label', `for ${why} Pieces comes straight after the label`);
  }

  await select(['signin']);
  const opened = await picker(),
    screenBox = await toScreen(await card('signin'));
  assert.ok(opened.open, 'selecting a screen opens the picker');
  assert.notStrictEqual(opened.focus, 'pkSearch', 'leaving the keyboard on the board');
  assert.ok(
    Math.abs((opened.rect?.left ?? 0) - (screenBox.r + 12)) < 1.5 &&
      Math.abs((opened.rect?.top ?? 0) - screenBox.t) < 1.5,
    `with no room on its left, docked 12 px right of its screen, level with its top: ${JSON.stringify({ picker: opened.rect, screenBox })}`,
  );
  const grid = await page.evaluate(() => ({
    heads: [...document.querySelectorAll('#pkGrid .pk-h')].map(h => h.textContent),
    counts: [...document.querySelectorAll('#pkGrid .pk-cells')].map(c => c.children.length),
    first: [...document.querySelectorAll('#pkGrid .pk-cell')].slice(0, 2).map(b => b.textContent),
    bare: [...document.querySelectorAll('#pkGrid [data-pk-piece]')]
      .filter(b => !b.querySelector('svg rect, svg circle'))
      .map(b => b.getAttribute('data-pk-piece')),
  }));
  assert.deepStrictEqual(
    grid,
    {
      heads: ['Basics', 'Buttons and inputs', 'Building blocks', 'Layouts'],
      counts: [9, 8, 8, 11],
      first: ['BoxR', 'TextX'],
      bare: [],
    },
    'four headings in order, Basics led by Box and Text, and every piece drawn small',
  );

  await search('dialog');
  assert.deepStrictEqual(await visible(), ['Modal'], '“dialog” finds Modal only');
  assert.deepStrictEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('#pkGrid .pk-group')]
        .filter(g => g instanceof HTMLElement && !g.hidden)
        .map(g => g.getAttribute('aria-label')),
    ),
    ['Building blocks'],
    'headings with no match hide',
  );
  await search('faq');
  assert.deepStrictEqual(await visible(), ['Accordion'], '“faq” finds Accordion');
  await search('zzzz');
  assert.deepStrictEqual(
    await page.evaluate(() => {
      const none = document.querySelector('#pkGrid .pk-none');
      return none instanceof HTMLElement && !none.hidden ? none.textContent : null;
    }),
    'No pieces match thatSearch icons for “zzzz”',
    '“zzzz” says nothing matches and offers the icons',
  );
  let before = await cards();
  await search('dialog');
  await page.press('#pkSearch', 'Enter');
  await settle(page, 300);
  const modal = (await made(before)).filter(c => c.group);
  const signin = await card('signin');
  assert.ok(modal.length > 0 && modal.every(c => inside(c, signin)), 'Enter adds the first match into the screen');
  assert.ok((await picker()).open, 'and the picker stays open');

  const body = (await cards()).filter(c => c.onFrame === 'signin' && !modal.some(m => m.id === c.id)),
    lowest = Math.max(...body.filter(c => c.y < signin.y + signin.h - 90).map(c => c.y + c.h));
  assert.ok(
    Math.abs(Math.min(...modal.map(c => c.y)) - (lowest + 16)) < 1,
    'a pick lands 16 px under the lowest piece',
  );

  await search('');
  await page.press('#pkSearch', 'Escape');
  assert.ok(!(await picker()).open, 'Esc with no words closes it');
  await select(['go0']);
  await page.click('#selbar [data-pieces]');
  await settle(page, 300);
  assert.ok((await picker()).open, 'Pieces on a piece opens the picker for its screen');
  for (const n of ['Divider', 'Space', 'Toggle']) {
    before = await cards();
    await search(n.toLowerCase());
    await page.click(`#pkGrid [data-pk-piece="${n}"]`);
    await settle(page, 300);
    const now = await made(before),
      f = await card('signin');
    assert.ok(now.length > 0 && now.every(c => inside(c, f)), `${n} lands in the piece's screen`);
    assert.ok((await picker()).open, `the picker stays open after ${n}, one of three picks in a row`);
  }

  before = await cards();
  await search('');
  await page.click('#pkGrid [data-pk-piece="Divider"]');
  await page.click('#pkGrid [data-pk-piece="Space"]');
  const both = (await cards()).length;
  await page.keyboard.press('Control+z');
  await settle(page, 300);
  const once = (await cards()).length;
  await page.keyboard.press('Control+z');
  await settle(page, 300);
  assert.deepStrictEqual(
    [both - before.length, once - before.length, (await cards()).length - before.length],
    [2, 1, 0],
    'two quick picks undo one at a time',
  );
  assert.ok((await picker()).open, 'an undo of a pick leaves the picker open');

  before = await cards();
  await page.click('#pkGrid [data-pk-tool="box"]');
  const at = await toScreen(await card('signin'));
  await page.mouse.move(at.l + 20, at.b - 60);
  await page.mouse.down();
  await page.mouse.move(at.l + 50, at.b - 40, { steps: 4 });
  await page.mouse.move(at.l + 80, at.b - 30, { steps: 4 });
  await page.mouse.up();
  await settle(page, 300);
  const z = await page.evaluate(() => window.__fenmyr.view.z),
    box = (await made(before)).find(c => c.type === 'box');
  assert.ok(
    box && Math.abs(box.w - 60 / z) < 2 && Math.abs(box.h - 30 / z) < 2 && box.onFrame === 'signin',
    `the Box cell then a drag makes a box the size of the drag, on the screen: ${JSON.stringify(box)}`,
  );
  assert.ok((await picker()).open, 'and the picker stays open');

  before = await cards();
  await page.click('#pkGrid [data-pk-tool="text"]');
  await page.mouse.click(at.l + 30, at.b - 90);
  await settle(page, 300);
  const text = (await made(before)).find(c => c.type === 'text'),
    editing = await page.evaluate(() => window.__fenmyr.editing);
  assert.ok(
    text && text.onFrame === 'signin' && editing === text.id,
    'the Text cell then a click makes a text on the screen, being typed in',
  );
  assert.ok((await picker()).open, 'and the picker stays open');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // web layouts are made for a desktop screen's width; on a phone screen their columns run past its edges
  const groups = await page.evaluate(() =>
      window.__fenmyr.PIECE_GROUPS.map(g => ({
        key: g.key,
        names: g.cells.flatMap(c => (c.kind === 'piece' ? [c.name] : [])),
      })),
    ),
    lost: string[] = [];
  for (const { key, names } of groups) {
    const id = key === 'layouts' ? 'desk' : 'empty';
    await select([id]);
    if (!(await picker()).open) await page.click('#selbar [data-pieces]');
    await settle(page, 300);
    for (const n of names) {
      before = await cards();
      await search(n);
      if (!(await visible()).includes(n)) lost.push(`${n}: not found by its name`);
      await page.click(`#pkGrid [data-pk-piece="${n}"]`);
      await page.waitForTimeout(40);
      const screen = await card(id),
        now = await made(before);
      if (!now.length || !now.every(c => inside(c, screen))) lost.push(`${n}: ${JSON.stringify({ now, screen })}`);
    }
    assert.ok((await picker()).open, `the picker is still open after every piece in ${key}`);
  }
  assert.strictEqual(groups.flatMap(g => g.names).length, 34, 'the picker holds all 34 pieces');
  assert.deepStrictEqual(lost, [], 'each of the 34, found by its name and clicked, lands inside its screen');
  assert.ok((await card('empty')).h > 852, 'a full screen grows to take more');
  assert.deepStrictEqual(l.errors, []);
  console.log('PIECE PICK OK');
} finally {
  await l.close();
}
