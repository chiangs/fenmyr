// The Pieces picker's Icons view adds an icon into its screen, and a piece or icon dragged out of the grid lands where it
// is let go: on a screen, filed into it, or on the bare board. Either way the picker stays open: a drop on another
// screen moves it there, and one on the bare board leaves it with its own. Let go over the picker, it lands nowhere. A
// click on a cell while a drag moves the board adds nothing.
import assert from 'node:assert';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [wireframeBoard()], open: 'wire' });
const { page } = l;

type Made = { id: string; type: string; x: number; y: number; w: number; h: number; on: string | null; name: string };
const cards = (): Promise<Made[]> =>
  page.evaluate(() =>
    (window.__fenmyr.curBoard()?.cards ?? []).map(c => ({
      id: c.id,
      type: c.type,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      on: c.onFrame ?? null,
      name: c.type === 'icon' ? (c.name ?? '') : '',
    })),
  );
const made = async (before: Made[]) => {
  const ids = new Set(before.map(c => c.id));
  return (await cards()).filter(c => !ids.has(c.id));
};
const toWorld = (x: number, y: number) =>
  page.evaluate(
    ([x, y]) => {
      const v = window.__fenmyr.view,
        s = document.getElementById('stage')?.getBoundingClientRect();
      return { x: (x - (s?.left ?? 0) - v.x) / v.z, y: (y - (s?.top ?? 0) - v.y) / v.z, z: v.z };
    },
    [x, y] as const,
  );
const pointIn = async (id: string, fx: number, fy: number) => {
  const c = (await cards()).find(c => c.id === id);
  if (!c) throw new Error(`no ${id}`);
  return page.evaluate(
    c => {
      const v = window.__fenmyr.view,
        s = document.getElementById('stage')?.getBoundingClientRect();
      return { x: (s?.left ?? 0) + v.x + (c.x + c.w * c.fx) * v.z, y: (s?.top ?? 0) + v.y + (c.y + c.h * c.fy) * v.z };
    },
    { ...c, fx, fy },
  );
};
const bare = () =>
  page.evaluate(() => {
    for (let y = 760; y > 100; y -= 30)
      for (let x = 280; x < 1150; x += 30)
        if (['grid', 'stage', 'world', 'cards'].includes(document.elementFromPoint(x, y)?.id ?? '')) return { x, y };
    throw new Error('no bare board in view');
  });
const dragOut = async (cell: string, to: { x: number; y: number }) => {
  const from = await page.locator(cell).boundingBox();
  if (!from) throw new Error(`no ${cell}`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await settle(page, 300);
};
const shown = () => page.evaluate(() => !document.getElementById('piecePick')?.hidden);
// selects the screen and opens the picker on it, unless it is open there already
const openOn = async (id: string) => {
  await page.evaluate(i => window.__fenmyr.selectOnly([i]), id);
  await settle(page, 250);
  if ((await page.getAttribute('#selbar [data-pieces]', 'aria-expanded')) !== 'true')
    await page.click('#selbar [data-pieces]');
  await settle(page, 250);
};
// a piece or icon is let go with its top-left corner 14 px up and left of the pointer, as the ghost carries it
const near = (c: { x: number; y: number } | undefined, w: { x: number; y: number; z: number }) =>
  !!c && Math.abs(c.x - (w.x - 14 / w.z)) < 2 && Math.abs(c.y - (w.y - 14 / w.z)) < 2;
const corner = (cs: Made[]) => ({ x: Math.min(...cs.map(c => c.x)), y: Math.min(...cs.map(c => c.y)) });

try {
  await settle(page, 800);
  await page.evaluate(() => window.__fenmyr.selectOnly(['signin']));
  await settle(page, 250);
  await page.click('#selbar [data-pieces]');
  await settle(page, 250);

  await page.click('#piecePick [data-pk-view="icons"]');
  await page.fill('#pkSearch', 'heart');
  await page.waitForTimeout(60);
  let before = await cards();
  await page.click('#pkGrid [data-pk-icon="heart"]');
  await settle(page, 300);
  const heart = (await made(before))[0],
    signin = (await cards()).find(c => c.id === 'signin');
  assert.ok(
    heart?.type === 'icon' &&
      heart.name === 'heart' &&
      heart.on === 'signin' &&
      !!signin &&
      heart.x >= signin.x &&
      heart.y >= signin.y &&
      heart.x + heart.w <= signin.x + signin.w &&
      heart.y + heart.h <= signin.y + signin.h,
    `Icons, “heart” and a click add a heart icon inside the screen: ${JSON.stringify(heart)}`,
  );

  const spot = await bare();
  before = await cards();
  await dragOut('#pkGrid [data-pk-icon="heart"]', spot);
  const dropped = (await made(before))[0];
  assert.ok(
    dropped?.type === 'icon' && dropped.on === null && near(dropped, await toWorld(spot.x, spot.y)),
    `an icon dragged onto the bare board lands where it is let go: ${JSON.stringify(dropped)}`,
  );

  assert.ok(await shown(), 'after a drop on the bare board the picker stays open');
  before = await cards();
  await page.click('#pkGrid [data-pk-icon="heart"]');
  await settle(page, 300);
  assert.deepStrictEqual(
    (await made(before)).map(c => c.on),
    ['signin'],
    'and its next pick still goes into its own screen',
  );
  const onScreen = await pointIn('desk', 0.8, 0.8);
  before = await cards();
  await dragOut('#pkGrid [data-pk-icon="heart"]', onScreen);
  const icon = await made(before),
    w = await toWorld(onScreen.x, onScreen.y);
  assert.ok(
    icon.length === 1 && icon[0]?.on === 'desk' && near(corner(icon), w),
    `an icon dragged onto another screen lands where it is let go, filed in: ${JSON.stringify({ icon, w })}`,
  );
  assert.ok(await shown(), 'after a drop on another screen the picker stays open');
  before = await cards();
  await page.click('#piecePick [data-pk-view="pieces"]');
  await page.fill('#pkSearch', '');
  await page.click('#pkGrid [data-pk-piece="Heading"]');
  await settle(page, 300);
  assert.deepStrictEqual(
    [
      await shown(),
      await page.getAttribute('#selbar [data-pieces]', 'aria-expanded'),
      (await made(before)).map(c => c.on),
    ],
    [true, 'true', ['desk', 'desk']],
    'a drop on another screen keeps the picker open and moves it there, so the next pick goes into that screen',
  );
  await page.evaluate(() => window.__fenmyr.selectOnly(['font']));
  await settle(page, 250);
  assert.ok(!(await shown()), 'selecting a card off its screen still closes it');

  await openOn('signin');
  const onDesk = await pointIn('desk', 0.6, 0.85);
  before = await cards();
  await dragOut('#pkGrid [data-pk-piece="Video"]', onDesk);
  const onto = await made(before),
    dw = await toWorld(onDesk.x, onDesk.y);
  assert.ok(
    onto.length > 0 && onto.every(c => c.on === 'desk') && near(corner(onto), dw),
    `Video dragged onto a screen lands where it is let go, filed in: ${JSON.stringify({ onto, dw })}`,
  );

  await openOn('signin');
  const off = await bare();
  before = await cards();
  await dragOut('#pkGrid [data-pk-piece="Video"]', off);
  const video = await made(before),
    ow = await toWorld(off.x, off.y);
  assert.ok(
    video.length > 0 && video.every(c => c.on === null) && near(corner(video), ow),
    `Video dragged onto the bare board lands there: ${JSON.stringify({ video, ow })}`,
  );

  await openOn('signin');
  const pick = await page.locator('#pkGrid .pk-h').first().boundingBox();
  if (!pick) throw new Error('no heading');
  before = await cards();
  await dragOut('#pkGrid [data-pk-piece="Video"]', { x: pick.x + 20, y: pick.y + 4 });
  assert.deepStrictEqual(
    [(await made(before)).length, await page.evaluate(() => document.getElementById('ghost')?.className)],
    [0, 'ghost'],
    'Video let go over the picker lands nowhere, and nothing stays on the cursor',
  );

  const head = await pointIn('head0', 0.5, 0.6);
  before = await cards();
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  await page.mouse.move(head.x + 30, head.y + 30, { steps: 6 });
  await page.evaluate(() => document.querySelector<HTMLElement>('#pkGrid [data-pk-piece="Divider"]')?.click());
  await page.mouse.up();
  await settle(page, 300);
  assert.deepStrictEqual(await made(before), [], 'a click on a cell while a drag runs adds nothing');
  assert.deepStrictEqual(l.errors, []);
  console.log('PIECE PICK DRAG OK');
} finally {
  await l.close();
}
