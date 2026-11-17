// One box's, text's or icon's bar shows its size as a dropdown of labelled fields: a box X, Y, W, H and Rotate, a text
// no H, an icon one Size. Everything typed in one visit undoes as one step, and the fields follow the card through a
// drag, Myra's change and an undo without ever overwriting the field being typed in. The keyboard reaches every field,
// Enter commits and Esc leaves what was typed. A locked card's fields are disabled, and on a phone the dropdown opens
// above the strip.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const board = wireframeBoard();
const on = (id: string, type: string, x: number, y: number, w: number, h: number, more = {}) => ({
  id,
  type,
  x: 470 + x,
  y,
  w,
  h,
  r: 0,
  color: 'white',
  onFrame: 'empty',
  ...more,
});
board.cards.push(
  on('fbox', 'box', 40, 100, 160, 100, { fill: '#e4e4e7' }),
  on('ftext', 'text', 40, 240, 220, 30, { text: 'Hello', size: 18 }),
  on('ficon', 'icon', 40, 460, 28, 28, { name: 'star' }),
  on('lbox', 'box', 40, 600, 160, 100, { fill: '#e4e4e7', locked: true }),
);
const l = await launch({ boards: [board], open: 'wire' });
const { page, app } = l;

type Shot = { x: number; y: number; w: number; h: number; rot?: number };
const card = (id: string): Promise<Shot> =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    if (!c) throw new Error(`no card ${i}`);
    return { x: c.x, y: c.y, w: c.w, h: c.h, rot: c.rot };
  }, id);
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const trigger = () => page.evaluate(() => document.querySelector('#selbar [data-pop="size"]')?.textContent?.trim());
const open = async () => {
  await page.click('#selbar [data-pop="size"]');
  await page.waitForTimeout(150);
};
const isOpen = () => page.evaluate(() => !!document.querySelector('#selbar [data-popw="size"].open'));
const focused = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a?.getAttribute('data-size') ?? a?.getAttribute('data-pop') ?? a?.tagName ?? '';
  });
const fields = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('#selbar [data-size]')].map(i => [
        i.getAttribute('data-size'),
        i instanceof HTMLInputElement ? i.value : '',
      ]),
    ),
  );
const field = (name: string) =>
  page.locator('#selbar [data-popw="size"]').getByRole('spinbutton', { name, exact: true });
const undo = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};

try {
  await settle(page, 800);
  await select(['fbox']);
  assert.strictEqual(await trigger(), '160 × 100', 'a box’s trigger shows its size');
  await open();
  for (const name of ['X position', 'Y position', 'Width', 'Height', 'Rotation in degrees'])
    assert.strictEqual(await field(name).count(), 1, `a screen reader finds the field “${name}”`);

  // a pause past the board's 350 ms settle between fields, so each would be its own undo step without the visit's
  await field('X position').fill('520');
  for (const [name, v] of [
    ['Y position', '120'],
    ['Width', '200'],
    ['Height', '90'],
    ['Rotation in degrees', '15'],
  ] as const) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(450);
    await field(name).fill(v);
  }
  await page.keyboard.press('Enter');
  await settle(page, 200);
  assert.deepStrictEqual(
    await card('fbox'),
    { x: 520, y: 120, w: 200, h: 90, rot: 15 },
    'a box takes X, Y, W, H and Rotate 15',
  );
  assert.strictEqual(await trigger(), '200 × 90', 'and its trigger follows');
  await undo();
  assert.deepStrictEqual(
    await card('fbox'),
    { x: 510, y: 100, w: 160, h: 100, rot: undefined },
    'one undo step for the whole visit',
  );

  await select(['fbox']);
  await open();
  await field('X position').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('77');
  const typing = await page.evaluate(() => {
    const i = document.activeElement;
    if (i instanceof HTMLElement) i.dataset.probe = 'kept';
    return i?.getAttribute('data-size');
  });
  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'Moved it.', move: [{ id: 'fbox', x: 530, y: 160 }] }, 'q'),
  );
  await settle(page, 400);
  const mid = await page.evaluate(() => {
    const i = document.activeElement;
    return {
      same: i instanceof HTMLElement && i.dataset.probe === 'kept',
      value: i instanceof HTMLInputElement ? i.value : '',
    };
  });
  assert.strictEqual(typing, 'x', 'typing in X');
  assert.ok(await isOpen(), 'Myra’s change leaves the dropdown open');
  assert.deepStrictEqual(
    mid,
    { same: true, value: '77' },
    'the field being typed in is neither rebuilt nor overwritten',
  );
  assert.strictEqual((await fields()).y, '160', 'while the other fields follow Myra’s change');
  await page.keyboard.press('Escape');
  await settle(page, 150);
  assert.strictEqual((await card('fbox')).x, 530, 'Esc leaves the typed X uncommitted');
  assert.strictEqual(await focused(), 'size', 'and puts focus back on the trigger');
  assert.ok(!(await isOpen()), 'and closes the dropdown');

  const box = await page.locator('#cards [data-id="fbox"]').boundingBox();
  assert.ok(box, 'the box is on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await settle(page, 250);
  const dragged = await card('fbox');
  assert.ok(dragged.x > 530, `the drag moved the box: ${dragged.x}`);
  await open();
  assert.deepStrictEqual(
    [(await fields()).x, (await fields()).y],
    [String(Math.round(dragged.x)), String(Math.round(dragged.y))],
    'after a drag the fields show where the box went',
  );
  await page.keyboard.press('Escape');
  await undo();
  await select(['fbox']);
  const undone = await card('fbox');
  await open();
  assert.strictEqual(
    (await fields()).x,
    String(Math.round(undone.x)),
    'after an undo the fields show the undone place',
  );
  await page.keyboard.press('Escape');

  // the keyboard: F10 into the bar, Tab to the trigger, Enter opens, Tab walks the fields, Enter commits
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('F10');
  for (let i = 0; i < 12 && (await focused()) !== 'size'; i++) await page.keyboard.press('Tab');
  assert.strictEqual(await focused(), 'size', 'Tab reaches the size trigger');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.ok(await isOpen(), 'Enter opens it');
  const walk: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    walk.push(await focused());
  }
  assert.deepStrictEqual(walk, ['x', 'y', 'w', 'h', 'rot'], 'Tab moves through X, Y, W, H and Rotate');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('240');
  await page.keyboard.press('Enter');
  await settle(page, 150);
  assert.strictEqual((await card('fbox')).w, 240, 'Enter commits W 240');
  assert.deepStrictEqual([await isOpen(), await focused()], [false, 'size'], 'and closes onto the trigger');

  await select(['ftext']);
  assert.strictEqual(await trigger(), '220', 'a text’s trigger shows its width');
  await open();
  assert.deepStrictEqual(Object.keys(await fields()), ['x', 'y', 'w', 'rot'], 'a text has no H');
  const textH = (await card('ftext')).h;
  await field('Width').fill('300');
  await page.keyboard.press('Enter');
  await settle(page, 150);
  const text = await card('ftext');
  assert.deepStrictEqual([text.w, text.h], [300, textH], 'W 300 widens the text and leaves its height');

  await select(['ficon']);
  assert.strictEqual(await trigger(), '28', 'an icon’s trigger shows its size');
  await open();
  assert.deepStrictEqual(Object.keys(await fields()), ['x', 'y', 'isz', 'rot'], 'an icon has one Size');
  await field('Icon size').fill('40');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  const big = await card('ficon');
  assert.deepStrictEqual([big.w, big.h], [40, 40], 'Size 40 makes it 40 × 40');
  await field('Icon size').fill('2');
  await page.keyboard.press('Enter');
  await settle(page, 150);
  const small = await card('ficon');
  assert.deepStrictEqual([small.w, small.h], [8, 8], 'Size 2 makes it 8 × 8, the least');

  await select(['lbox']);
  await open();
  const locked = await page.evaluate(() =>
    [...document.querySelectorAll('#selbar [data-size]')].map(i => i.matches(':disabled')),
  );
  assert.deepStrictEqual(locked, [true, true, true, true, true], 'a locked box’s fields are disabled');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === 'lbox');
    if (c) c.locked = false;
  });
  await settle(page, 250);
  await open();
  const unlocked = await page.evaluate(() =>
    [...document.querySelectorAll('#selbar [data-size]')].map(i => i.matches(':disabled')),
  );
  assert.deepStrictEqual(unlocked, [false, false, false, false, false], 'and enabled once it is unlocked');
  await page.keyboard.press('Escape');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 700);
  await select(['fbox']);
  const strip = await page.evaluate(() => {
    const bar = document.getElementById('selbar');
    const name = (b: Element | null | undefined) =>
      b?.getAttribute('data-pop') ?? b?.getAttribute('data-pieces') ?? b?.getAttribute('data-sb') ?? '';
    return {
      shows: [...(bar?.querySelectorAll('button') ?? [])]
        .filter(b => b.checkVisibility() && !b.closest('.sb-pop'))
        .map(b => (b.hasAttribute('data-pieces') ? 'pieces' : name(b))),
      tucked: [...(bar?.querySelector('.sb-morebody')?.children ?? [])].map(g => name(g.querySelector('button'))),
    };
  });
  assert.deepStrictEqual(
    strip,
    { shows: ['pieces', 'fill', 'stroke', 'more', 'del'], tucked: ['align', 'size', 'tag', 'corners'] },
    'at 390 px the strip shows Pieces, Fill, Stroke, ··· and Delete, with Align, Size, the label and Corners in ···',
  );
  await page.click('#selbar [data-pop="more"]');
  await page.waitForTimeout(250);
  await page.click('#selbar [data-pop="size"]');
  await page.waitForTimeout(250);
  const sheet = await page.evaluate(() => {
    const p = document.querySelector('.sb-pop-size')?.getBoundingClientRect(),
      strip = document.getElementById('selbar')?.getBoundingClientRect(),
      w = document.querySelector('#selbar [data-size="w"]'),
      r = w?.getBoundingClientRect(),
      hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { p: p?.toJSON(), strip: strip?.toJSON(), hit: hit === w };
  });
  assert.ok(
    sheet.p && sheet.strip && sheet.p.left >= 0 && sheet.p.right <= 390 && sheet.p.bottom <= sheet.strip.top,
    `on a phone the size dropdown opens above the strip, inside the screen: ${JSON.stringify(sheet)}`,
  );
  assert.ok(sheet.hit, 'and W can be pressed there');
  await page.click('#selbar [data-size="w"]');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('180');
  await page.keyboard.press('Enter');
  await settle(page, 150);
  assert.strictEqual((await card('fbox')).w, 180, 'and typing W 180 there sizes the box');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('sizeBar: ok');
} finally {
  await l.close();
}
