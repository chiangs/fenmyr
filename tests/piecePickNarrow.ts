// The Pieces picker in a narrow window and on a prototype board. When the free board has no room for the picker beside
// its screen, it becomes a sheet across the bottom: every control the bar shows can still be clicked, and the screen
// still shows.
import assert from 'node:assert';
import fs from 'node:fs';
import { launch, settle } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const board = (id: string, w: number, h: number, device: string, radius: number) => ({
  id,
  name: id,
  cards: [{ id: 'S', type: 'frame', x: 0, y: 0, w, h, r: 0, device, radius, name: 'Sign in', fill: '#ffffff' }],
  links: [],
  tray: [],
});
const { work, repo } = freshRepo('fenmyr-pick-narrow-');
const l = await launch({
  boards: [board('ph', 393, 852, 'iPhone', 44), board('dk', 1440, 1024, 'Desktop', 10)],
  open: 'ph',
});
const { page, app } = l;

const size = async (w: number, h: number) => {
  await app.evaluate(({ BrowserWindow }, [w = 0, h = 0]) => BrowserWindow.getAllWindows()[0]?.setSize(w, h), [w, h]);
  await settle(page, 700);
};
// the bar's controls that answer a click at their middle and those that don't, and how much of the screen shows
const look = () =>
  page.evaluate(() => {
    const bar = document.querySelector('#selbar.on'),
      shown = (bar ? [...bar.querySelectorAll('button')] : []).filter(b => b.checkVisibility()),
      hits = (b: HTMLElement) => {
        const r = b.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button') === b;
      },
      name = (b: HTMLElement) => b.textContent?.trim() || b.title;
    const s = document.querySelector('#cards [data-id="S"]')?.getBoundingClientRect();
    let shows = 0;
    if (s)
      for (let x = Math.max(0, s.left + 4); x < Math.min(innerWidth, s.right); x += 12)
        for (let y = Math.max(0, s.top + 4); y < Math.min(innerHeight, s.bottom); y += 12)
          if (document.elementFromPoint(x, y)?.closest('[data-id="S"]')) shows++;
    return { reach: shown.filter(hits).map(name), miss: shown.filter(b => !hits(b)).map(name), shows };
  });
// the board with only its screen, seen from x, y at zoom z, the screen selected; then the picker opened on it
const openOn = async (id: string, z: number, x: number, y: number) => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(
    async ([id = '', z = 1, x = 0, y = 0]) => {
      if (window.__fenmyr.curBoard()?.id !== id) await window.__fenmyr.openBoard(id);
      const b = window.__fenmyr.curBoard();
      if (b) b.cards = b.cards.filter(c => c.id === 'S');
      for (const c of b?.cards ?? []) c.h = c.w > 500 ? 1024 : 852;
      window.__fenmyr.renderAll();
      Object.assign(window.__fenmyr.view, { x, y, z });
      window.__fenmyr.applyView();
      window.__fenmyr.selectOnly(['S']);
    },
    [id, z, x, y] as const,
  );
  await settle(page, 500);
  const before = await look();
  await page.evaluate(() => document.querySelector<HTMLElement>('#selbar [data-pieces]')?.click());
  await settle(page, 450);
  return before;
};

try {
  await settle(page, 800);
  await size(800, 800);
  const st = await page.evaluate(() => document.getElementById('stage')?.getBoundingClientRect().toJSON());
  const W = st?.width ?? 800,
    H = st?.height ?? 800;
  for (const z of [0.3, 1, 4]) {
    const sw = 393 * z,
      sh = 852 * z;
    for (const [where, x, y] of [
      ['in the middle', W / 2 - sw / 2, sh > H ? 70 : H / 2 - sh / 2],
      ['at the left', 280, 80],
      ['at the right', W - 290 - sw, 80],
      ['at the top', W / 2 - sw / 2, -sh / 2],
      ['at the bottom', W / 2 - sw / 2, H - Math.min(sh, H) / 3],
    ] as const) {
      const before = await openOn('ph', z, x, y),
        after = await look();
      assert.deepStrictEqual(
        [after.miss, after.reach.includes('Delete'), before.shows > 0, after.shows > 0],
        [[], true, true, true],
        `at 800 px, with the screen ${where} at ${z * 100}%, every control in the bar can be clicked and the screen shows`,
      );
    }
  }
  assert.strictEqual(
    await page.evaluate(() => document.getElementById('piecePick')?.dataset.dock),
    'sheet',
    'at 800 px the picker is a sheet across the bottom of the board',
  );

  // The bar on a prototype board with its widgets open already reaches past the board's 342 px column, so Delete is
  // out of reach before the picker opens; opening it must cost nothing more.
  await size(1440, 900);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await openPrototype(page, repo);
  await page.evaluate(async () => {
    await window.__fenmyr.openBoard('ph');
    const s = window.__fenmyr.curBoard()?.cards.find(c => c.id === 'S');
    await window.__fenmyr.openBoard('pb');
    if (s) window.__fenmyr.curBoard()?.cards.push({ ...s, x: 40, y: 40 });
  });
  await settle(page, 800);
  const before = await openOn('pb', 0.5, 40, 40),
    after = await look(),
    inPane = await page.evaluate(() => {
      const p = document.getElementById('piecePick')?.getBoundingClientRect(),
        s = document.getElementById('stage')?.getBoundingClientRect();
      return !!p && !!s && p.width >= 292 && p.left >= s.left && p.right <= s.right;
    });
  assert.deepStrictEqual(
    [after.reach, after.shows > 0, inPane],
    [before.reach, before.shows > 0, true],
    'on a prototype board at 1440 px the picker keeps to the board, every control reachable before stays so, and the screen shows as before',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('PIECE PICK NARROW OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
