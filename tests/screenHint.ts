// An empty screen shows Add pieces and the keys for a box and text, at one size on screen whatever the zoom. Add pieces
// selects the screen and opens the picker; once a piece sits on the screen the hint goes, and a screen too small on
// screen has none. On a phone the strip's Pieces opens the picker above the bottom bar.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page } = l;

const zoom = async (z: number) => {
  await page.evaluate(z => {
    Object.assign(window.__fenmyr.view, { x: 200, y: 60, z });
    window.__fenmyr.applyView();
  }, z);
  await settle(page, 300);
};
const hints = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#screenHints .screen-hint')]
      .filter(h => h instanceof HTMLElement && h.checkVisibility())
      .map(h => {
        const b = h.querySelector('button'),
          r = h.getBoundingClientRect();
        return {
          id: b?.dataset.hint ?? '',
          words: h.textContent,
          middle: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
          button: b?.getBoundingClientRect().height ?? 0,
        };
      }),
  );
const middleOf = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.curBoard()?.cards.find(c => c.id === id),
      v = window.__fenmyr.view,
      s = document.getElementById('stage')?.getBoundingClientRect();
    if (!c || !s) throw new Error(`no ${id}`);
    return { x: s.left + v.x + (c.x + c.w / 2) * v.z, y: s.top + v.y + (c.y + c.h / 2) * v.z };
  }, id);
const picker = () =>
  page.evaluate(() => {
    const p = document.getElementById('piecePick');
    return {
      open: !!p && !p.hidden,
      focus: document.activeElement?.id ?? '',
      rect: p?.getBoundingClientRect().toJSON(),
    };
  });

try {
  await settle(page, 800);
  await zoom(0.5);
  const shown = await hints(),
    mid = await middleOf('empty');
  assert.deepStrictEqual(
    shown.map(h => [h.id, h.words]),
    [['empty', 'Add piecesor press R for a box,X for text']],
    'only the empty screen shows Add pieces and the keys for a box and text',
  );
  assert.ok(
    Math.abs((shown[0]?.middle.x ?? 0) - mid.x) < 2 && Math.abs((shown[0]?.middle.y ?? 0) - mid.y) < 2,
    `the hint sits in the middle of its screen: ${JSON.stringify({ shown, mid })}`,
  );
  await zoom(1);
  assert.ok(
    Math.abs(((await hints())[0]?.button ?? 0) - (shown[0]?.button ?? -9)) < 0.5,
    'the hint is the same size on screen at 50% and 100%',
  );
  await zoom(0.5);

  await page.click('#screenHints [data-hint="empty"]');
  await settle(page, 300);
  assert.deepStrictEqual(
    [await page.evaluate(() => window.__fenmyr.sel), (await picker()).open, (await picker()).focus],
    [['empty'], true, 'pkSearch'],
    'Add pieces selects its screen and opens the picker, with the cursor in its search',
  );
  await page.click('#pkGrid [data-pk-piece="Button"]');
  await settle(page, 300);
  assert.deepStrictEqual(await hints(), [], 'once a piece sits on the screen its hint goes');

  await page.keyboard.press('Control+z');
  await settle(page, 300);
  assert.deepStrictEqual(
    (await hints()).map(h => h.id),
    ['empty'],
    'undoing the piece brings the hint back',
  );
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('n');
  const on = await middleOf('empty');
  await page.mouse.click(on.x, on.y - 120);
  await settle(page, 300);
  assert.deepStrictEqual(await hints(), [], 'a note dropped on the screen, though not filed into it, hides the hint');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await settle(page, 300);
  assert.deepStrictEqual(
    (await hints()).map(h => h.id),
    ['empty'],
    'and taking the note away brings it back',
  );
  await zoom(0.25);
  assert.deepStrictEqual(await hints(), [], 'at 25% the screen is 98 px wide on screen, too small for the hint');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await settle(page, 600);
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 20, y: 80, z: 0.4 });
    window.__fenmyr.applyView();
    window.__fenmyr.selectOnly(['signin']);
  });
  await settle(page, 400);
  await page.click('#dock #selbar [data-pieces]');
  await settle(page, 300);
  const phone = await picker(),
    dock = await page.evaluate(() => document.getElementById('dock')?.getBoundingClientRect().toJSON());
  assert.ok(
    phone.open &&
      !!phone.rect &&
      !!dock &&
      Math.abs(phone.rect.left - 10) < 1 &&
      Math.abs(phone.rect.right - 380) < 1 &&
      phone.rect.bottom <= dock.top - 9 &&
      phone.rect.height <= 422,
    `on a phone the strip's Pieces opens the picker above the bottom bar: ${JSON.stringify({ phone, dock })}`,
  );
  const n = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
  await page.click('#pkGrid [data-pk-piece="Divider"]');
  await settle(page, 300);
  const landed = await page.evaluate(
    n =>
      window.__fenmyr
        .curBoard()
        ?.cards.slice(n)
        .map(c => c.onFrame),
    n,
  );
  assert.deepStrictEqual(landed, ['signin'], 'and a pick lands in the screen');
  assert.deepStrictEqual(l.errors, []);
  console.log('SCREEN HINT OK');
} finally {
  await l.close();
}
