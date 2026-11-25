// A selected screen's bar shows its device after Pieces, as a dropdown with Name, the devices with their sizes, and X,
// Y, W and H. A device sets the size and corners as one undo step, a typed W or H makes it Custom, and X moves the
// screen with what sits on it. The trigger and the fields follow a resize by its handle, and a screen resized alone
// or with another card reads Custom.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

// the picker that selecting a screen opens would fold the bar into ···, and this checks the bar's own controls
const l = await launch({ boards: [wireframeBoard()], open: 'wire', settings: { autoPieces: false } });
const { page } = l;

type Shot = { x: number; y: number; w: number; h: number; radius?: number; device?: string; name?: string };
const card = (id: string): Promise<Shot> =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    if (!c) throw new Error(`no card ${i}`);
    return {
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      radius: c.radius,
      device: c.type === 'frame' ? c.device : undefined,
      name: c.type === 'frame' ? c.name : undefined,
    };
  }, id);
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await settle(page, 250);
};
const trigger = () => page.evaluate(() => document.querySelector('#selbar [data-pop="place"]')?.textContent?.trim());
const open = async () => {
  await page.click('#selbar [data-pop="place"]');
  await page.waitForTimeout(150);
};
const isOpen = () => page.evaluate(() => !!document.querySelector('#selbar [data-popw="place"].open'));
const fields = () =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('#selbar [data-size]')].map(i => [
        i.getAttribute('data-size'),
        i instanceof HTMLInputElement ? i.value : '',
      ]),
    ),
  );
const type = async (f: string, v: string, then = 'Tab') => {
  await page.fill(`#selbar [data-size="${f}"]`, v);
  await page.keyboard.press(then);
  await page.waitForTimeout(100);
};
const undo = async () => {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 250);
};

try {
  await settle(page, 800);
  await select(['signin']);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('#selbar button')]
      .filter(b => b.checkVisibility() && !b.closest('.sb-pop'))
      .map(b => b.getAttribute('data-pieces') ?? b.getAttribute('data-pop') ?? ''),
  );
  assert.strictEqual(await trigger(), 'iPhone', 'a selected screen’s bar shows its device');
  assert.strictEqual(order[order.indexOf('signin') + 1], 'place', `the device comes straight after Pieces: ${order}`);

  await open();
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('#selbar [data-device]')].map(b => [
      b.textContent?.trim().replace(/\s+/g, ' '),
      b.getAttribute('aria-pressed'),
    ]),
  );
  assert.deepStrictEqual(
    rows,
    [
      ['Custom', 'false'],
      ['iPhone 393 × 852', 'true'],
      ['Android 412 × 915', 'false'],
      ['iPad 834 × 1194', 'false'],
      ['Desktop 1440 × 1024', 'false'],
      ['Watch 205 × 251', 'false'],
    ],
    'Custom first, then each device with its size, iPhone pressed',
  );
  assert.deepStrictEqual(
    await fields(),
    { name: 'Sign in', x: '0', y: '0', w: '393', h: '852' },
    'Name, X, Y, W and H hold the screen’s own values',
  );

  await type('name', 'Log in', 'Enter');
  assert.strictEqual((await card('signin')).name, 'Log in', 'Name renames the screen');
  assert.ok(
    !(await isOpen()) && (await page.evaluate(() => document.activeElement?.getAttribute('data-pop'))) === 'place',
    'Enter commits and closes, with focus back on the trigger',
  );

  await open();
  await page.click('#selbar [data-device="iPad"]');
  await settle(page, 200);
  assert.deepStrictEqual(
    await card('signin'),
    { x: 0, y: 0, w: 834, h: 1194, radius: 20, device: 'iPad', name: 'Log in' },
    'iPad sets 834 × 1194 and corners 20',
  );
  assert.strictEqual(await trigger(), 'iPad', 'and the trigger says iPad');
  await undo();
  assert.deepStrictEqual(
    await card('signin'),
    { x: 0, y: 0, w: 393, h: 852, radius: 44, device: 'iPhone', name: 'Log in' },
    'one undo puts back the size and corners together',
  );

  await select(['signin']);
  await open();
  await type('w', '500');
  const typedW = await card('signin');
  assert.deepStrictEqual([typedW.w, typedW.h, typedW.device], [500, 852, 'Custom'], 'W 500 turns it Custom');
  await page.keyboard.press('Escape');
  assert.strictEqual(await trigger(), 'Custom', 'and the trigger says Custom');
  await undo();

  await select(['empty']);
  await open();
  await type('h', '900');
  const typedH = await card('empty');
  assert.deepStrictEqual([typedH.w, typedH.h, typedH.device], [393, 900, 'Custom'], 'H 900 turns it Custom too');
  await page.keyboard.press('Escape');
  await undo();

  await select(['signin']);
  const navBefore = await card('nav0');
  await open();
  await type('x', '40', 'Enter');
  const navAfter = await card('nav0');
  assert.strictEqual((await card('signin')).x, 40, 'X 40 moves the screen');
  assert.strictEqual(navAfter.x - navBefore.x, 40, 'and what sits on it comes along');
  await undo();

  await select(['signin']);
  const rh = await page.locator('#rh').boundingBox();
  assert.ok(rh, 'the resize corner is up');
  await page.mouse.move(rh.x + rh.width / 2, rh.y + rh.height / 2);
  await page.mouse.down();
  await page.mouse.move(rh.x + 60, rh.y + 40, { steps: 6 });
  await page.mouse.up();
  await settle(page, 250);
  const resized = await card('signin');
  assert.ok(resized.w > 393 && resized.h > 852, `the handle made it bigger: ${resized.w} × ${resized.h}`);
  assert.strictEqual(await trigger(), 'Custom', 'after a handle resize the trigger says Custom');
  assert.strictEqual(resized.device, 'Custom', 'as does the screen itself');
  await open();
  const after = await fields();
  assert.deepStrictEqual(
    [after.w, after.h],
    [String(Math.round(resized.w)), String(Math.round(resized.h))],
    'and the fields show the new size',
  );

  await type('y', '-60');
  assert.strictEqual((await card('signin')).y, -60, 'Y typed in the open fields moves the screen');
  await page.keyboard.press('Escape');

  await select(['empty', 'signin']);
  const grh = await page.locator('#rh').boundingBox();
  assert.ok(grh, 'the resize corner is up for two screens');
  await page.mouse.move(grh.x + grh.width / 2, grh.y + grh.height / 2);
  await page.mouse.down();
  await page.mouse.move(grh.x + 40, grh.y + 30, { steps: 6 });
  await page.mouse.up();
  await settle(page, 250);
  await select(['empty']);
  assert.deepStrictEqual(
    [await trigger(), (await card('empty')).device],
    ['Custom', 'Custom'],
    'a screen resized with another reads Custom in the trigger and on itself',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('screenBar: ok');
} finally {
  await l.close();
}
