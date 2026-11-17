// One piece on a screen shows Align ▾, which lines it up with its screen: a single card or a whole piece of several
// cards, moved as one, and a visit's clicks undo as one step. A locked piece stays. Two or more pieces keep the inline
// buttons and line up with each other, and a lone group on the bare board, with nothing to line up with, shows none.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const box = (id: string, x: number, y: number, more = {}) => ({
  id,
  type: 'box',
  x: 470 + x,
  y,
  w: 160,
  h: 100,
  r: 0,
  color: 'white',
  onFrame: 'empty',
  fill: '#e4e4e7',
  ...more,
});
const note = (id: string, x: number) => ({
  id,
  type: 'note',
  x,
  y: -500,
  w: 220,
  h: 120,
  r: 0,
  color: 'white',
  text: id,
  group: 'g1',
});
board.cards.push(
  box('fbox', 40, 100),
  box('b2', 200, 300),
  box('lbox', 40, 600, { locked: true }),
  note('ga', 0),
  note('gb', 300),
);
const l = await launch({ boards: [board], open: 'wire' });
const { page } = l;

type Shot = { id: string; x: number; y: number; w: number; h: number };
const cards = (ids: string[]): Promise<Shot[]> =>
  page.evaluate(
    i =>
      (window.__fenmyr.curBoard()?.cards ?? [])
        .filter(c => i.includes(c.id))
        .map(c => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h })),
    ids,
  );
const card = async (id: string) => {
  const [c] = await cards([id]);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const arrange = () =>
  page.evaluate(() => ({
    dropdown: document.querySelector('#selbar [data-pop="align"]')?.textContent?.trim() ?? null,
    inline: [...document.querySelectorAll('#selbar [data-arr]')]
      .filter(b => !b.closest('.sb-pop'))
      .map(b => b.getAttribute('data-arr')),
    inside: [...document.querySelectorAll('#selbar .sb-pop-align [data-arr]')].map(b => [
      b.getAttribute('data-arr'),
      b.getAttribute('title') ?? b.getAttribute('aria-label'),
      b.matches(':disabled'),
    ]),
  }));
const pick = async (how: string) => {
  await page.click(`#selbar .sb-pop-align [data-arr="${how}"]`);
  await page.waitForTimeout(450);
};
const undo = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};

try {
  await settle(page, 800);
  await select(['fbox']);
  const one = await arrange();
  assert.strictEqual(one.dropdown, 'Align', 'one box on a screen shows Align ▾');
  assert.deepStrictEqual(one.inline, [], 'and no inline buttons');
  assert.deepStrictEqual(
    one.inside,
    [
      ['left', 'To the left edge', false],
      ['hcenter', 'To the centre', false],
      ['right', 'To the right edge', false],
      ['top', 'To the top', false],
      ['vcenter', 'To the middle', false],
      ['bottom', 'To the bottom', false],
    ],
    'it holds the six buttons, named against the screen, without spacing',
  );

  await page.click('#selbar [data-pop="align"]');
  await page.waitForTimeout(150);
  await pick('hcenter');
  const empty = await card('empty');
  assert.strictEqual(
    (await card('fbox')).x,
    Math.round(empty.x + (empty.w - 160) / 2),
    'Centre puts the box in the middle of its screen across',
  );
  await pick('vcenter');
  assert.strictEqual((await card('fbox')).y, Math.round(empty.y + (empty.h - 100) / 2), 'and Middle down');
  assert.ok(
    await page.evaluate(() => !!document.querySelector('#selbar [data-popw="align"].open')),
    'the dropdown stays open between clicks',
  );
  await page.keyboard.press('Escape');
  await undo();
  const back = await card('fbox');
  assert.deepStrictEqual([back.x, back.y], [510, 100], 'one undo puts back both clicks of the visit');

  const go = (await cards(board.cards.filter(c => 'group' in c && c.group === 'go').map(c => c.id))).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  assert.ok(go.length > 1, 'the Button piece is several cards');
  await select(go.map(c => c.id));
  assert.strictEqual((await arrange()).dropdown, 'Align', 'a whole piece on a screen shows Align ▾');
  await page.click('#selbar [data-pop="align"]');
  await page.waitForTimeout(150);
  await pick('bottom');
  const moved = (await cards(go.map(c => c.id))).sort((a, b) => a.id.localeCompare(b.id)),
    signin = await card('signin'),
    dy = (moved[0]?.y ?? 0) - (go[0]?.y ?? 0);
  assert.strictEqual(
    Math.max(...moved.map(c => c.y + c.h)),
    signin.y + signin.h,
    'Bottom puts the piece on its screen’s bottom edge',
  );
  assert.ok(
    moved.every((c, i) => c.y - (go[i]?.y ?? 0) === dy && c.x === go[i]?.x),
    `and moves its cards as one: ${JSON.stringify({ go, moved })}`,
  );
  await page.keyboard.press('Escape');

  await select(['lbox']);
  const lockedBar = await arrange();
  assert.strictEqual(lockedBar.dropdown, 'Align', 'a locked box on a screen shows Align ▾');
  assert.ok(
    lockedBar.inside.every(([, , off]) => off),
    'with its buttons disabled',
  );
  await page.evaluate(() => {
    const b = document.querySelector('#selbar .sb-pop-align [data-arr="hcenter"]');
    if (!(b instanceof HTMLButtonElement)) throw new Error('no Centre');
    b.disabled = false;
    b.click();
  });
  await settle(page, 200);
  const stayed = await card('lbox');
  assert.deepStrictEqual(
    [stayed.x, stayed.y],
    [510, 600],
    'and a click that gets through anyway leaves it where it is',
  );

  await select(['fbox', 'b2']);
  const two = await arrange();
  assert.deepStrictEqual(
    [two.dropdown, two.inline],
    [null, ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']],
    'two pieces keep today’s inline buttons',
  );
  await page.click('#selbar [data-arr="top"]');
  await settle(page, 200);
  const [a, b] = await cards(['fbox', 'b2']);
  assert.deepStrictEqual([a?.y, b?.y], [100, 100], 'and Align tops lines them up with each other');

  await select(['ga', 'gb']);
  assert.deepStrictEqual(
    await arrange(),
    { dropdown: null, inline: [], inside: [] },
    'a lone group on the bare board shows no arrange',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('alignBar: ok');
} finally {
  await l.close();
}
