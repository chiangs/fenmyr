import assert from 'node:assert';
import type { Page } from 'playwright';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const board = (ideas: number) => ({
  id: 'b',
  name: 'Bare',
  cards: [note],
  links: [],
  tray: Array.from({ length: ideas }, (_, i) => ({
    id: `t${i}`,
    type: 'note',
    text: `Idea ${i}`,
    color: 'white',
    w: 220,
    h: 120,
  })),
  view: { x: 300, y: 200, z: 1 },
});

const rect = async (page: Page, sel: string) => {
  await still(page);
  return page.evaluate(s => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null;
  }, sel);
};
const glided = (page: Page, text: string) =>
  page.waitForFunction(
    t =>
      document.getElementById('zoom')?.textContent === t &&
      !document.getElementById('stage')?.classList.contains('moving'),
    text,
  );
const kids = (page: Page, id: string) =>
  page.evaluate(
    i =>
      Array.from(
        document.getElementById(i)?.children ?? [],
        c => c.id || (c instanceof HTMLElement ? (c.dataset.box ?? '') : ''),
      ).filter(Boolean),
    id,
  );
const saved = (page: Page) =>
  page.evaluate(() => {
    const s: unknown = JSON.parse(localStorage.getItem('fenmyr:settings') ?? '{}');
    return s && typeof s === 'object' && 'layout' in s ? s.layout : null;
  });
const shown = (page: Page) => page.evaluate(() => (document.getElementById('zoom')?.getClientRects().length ?? 0) > 0);
const near = (a: number, b: number, why: string) => assert.ok(Math.abs(a - b) < 0.6, `${why}: ${a} is not ${b}`);

// lifts the widget by its title and drops it on the last drop box of the left column, or lets go with Esc
const drag = async (page: Page, drop: boolean) => {
  const h = await rect(page, '.box[data-box="zoom"] .label');
  assert.ok(h, 'the widget has a title to drag it by');
  await page.mouse.move(h.l + 5, h.t + 5);
  await page.mouse.down();
  await page.mouse.move(h.l - 30, h.t + 40, { steps: 6 });
  const slots = await page.$$eval('#side .wg-slot', els =>
    els.map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }),
  );
  const last = slots.at(-1);
  assert.ok(last, 'drop boxes show in the left column while it is lifted');
  await page.mouse.move(last.x, last.y, { steps: 6 });
  if (drop) await page.mouse.up();
  else {
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  await still(page);
};

const resize = async (l: Awaited<ReturnType<typeof launch>>, w: number, h: number) => {
  await l.app.evaluate(
    ({ BrowserWindow }, [ww, hh]) => BrowserWindow.getAllWindows()[0]?.setSize(ww ?? 0, hh ?? 0),
    [w, h],
  );
  await l.page.waitForFunction(s => innerWidth === s.w && innerHeight === s.h, { w, h });
  await still(l.page);
};

const l = await launch({ boards: [board(2)], open: 'b' });
const { page } = l;
try {
  assert.deepStrictEqual(
    await kids(page, 'sideR'),
    ['tray', 'zoom'],
    'zoom starts in the right column, after Unsorted',
  );
  const [trayBox, zoomBox, side] = await Promise.all([
    rect(page, '#tray'),
    rect(page, '.box[data-box="zoom"]'),
    rect(page, '#sideR'),
  ]);
  assert.ok(trayBox && zoomBox && side, 'both are on screen');
  assert.ok(zoomBox.t >= trayBox.b, 'and below it');
  assert.ok(zoomBox.b <= 900, 'on the screen');
  assert.ok(Math.abs(zoomBox.l - trayBox.l) < 1 && Math.abs(zoomBox.r - trayBox.r) < 1, 'as wide as Unsorted');

  assert.deepStrictEqual(
    await page.evaluate(() => Array.from(document.getElementById('dock')?.children ?? [], c => c.id)),
    ['myra'],
    'the bottom bar holds only Myra',
  );
  for (const [w, h] of [
    [1440, 900],
    [1101, 700],
  ] as const) {
    await resize(l, w, h);
    const dock = await rect(page, '#dock'),
      inner = await page.evaluate(() => innerWidth);
    assert.ok(dock, 'the bar is there');
    near(dock.w, 200, `at ${w} wide the bar is her box and no more`);
    near((dock.l + dock.r) / 2, inner / 2, `at ${w} wide Myra is centred`);
  }
  await resize(l, 1440, 900);

  await page.click('#zoom');
  const below = await rect(page, '#rowMenu'),
    btn = await rect(page, '#zoom');
  assert.ok(below && btn, 'the zoom menu opens');
  assert.ok(below.t >= btn.b, 'under the widget');
  assert.ok(below.l >= 0 && below.r <= 1440 && below.b <= 900, 'inside the window');
  assert.ok(Math.abs(below.r - btn.r) < 3, 'with its right edge level with the button’s');
  await page.click('#rowMenu [data-i="0"]');
  await glided(page, '50%');
  assert.strictEqual(await page.textContent('#zoom'), '50%', 'its 50% choice zooms');

  await drag(page, false);
  assert.deepStrictEqual(await kids(page, 'sideR'), ['tray', 'zoom'], 'Esc puts it back');
  assert.strictEqual(await saved(page), null, 'and saves nothing');
  assert.strictEqual(await page.$$eval('.wg-slot', s => s.length), 0, 'the drop boxes go');

  await drag(page, true);
  assert.deepStrictEqual(
    await kids(page, 'side'),
    ['boards', 'layers', 'colors', 'zoom'],
    'dropped in the left column',
  );
  assert.deepStrictEqual(await kids(page, 'sideR'), ['tray'], 'and gone from the right one');
  assert.deepStrictEqual(
    await saved(page),
    { left: ['layers', 'colors', 'zoom'], right: ['tray'] },
    'the layout is kept with it',
  );
  await page.click('#zoom');
  const left = await rect(page, '#rowMenu');
  assert.ok(left && left.l >= 0 && left.r <= 1440, 'its menu still opens inside the window from the left column');
  await page.keyboard.press('Escape');

  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="layout"]');
  await page.click('#wgReset');
  await page.click('#setClose');
  await still(page);
  assert.deepStrictEqual(await kids(page, 'sideR'), ['tray', 'zoom'], 'Reset layout puts it back under Unsorted');

  await page.click('#homeBtn');
  await page.waitForFunction(() => document.getElementById('stage')?.classList.contains('at-home'));
  await still(page);
  assert.strictEqual(await shown(page), false, 'at Home, where there is nothing to zoom, it is hidden');
  await page.click('#brand');
  await still(page);

  await resize(l, 600, 900);
  assert.strictEqual(await shown(page), false, 'on a phone the widget is not shown: pinch zooms');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
} finally {
  await l.close();
}

// a full Unsorted in a short window gives way, so the widget under it stays on screen, and its menu opens above it
const crowded = await launch({ boards: [board(12)], open: 'b' });
try {
  await resize(crowded, 1280, 560);
  const fit = await rect(crowded.page, '.box[data-box="zoom"]'),
    tray = await rect(crowded.page, '#tray');
  assert.ok(fit && tray, 'the widget and Unsorted show');
  assert.ok(fit.b <= 560, `in a short window the widget is on screen, ending at ${fit.b}`);
  assert.ok(tray.h >= 150, 'and Unsorted gave way no further than its least height');
  await crowded.page.click('#zoom');
  const above = await rect(crowded.page, '#rowMenu'),
    low = await rect(crowded.page, '#zoom');
  assert.ok(above && low, 'the menu opens in a short window');
  assert.ok(above.b <= low.t, 'above the widget when there is no room under it');
  assert.ok(above.t >= 0 && above.r <= 1280, 'still inside the window');
  assert.deepStrictEqual(crowded.errors, [], 'no errors on the page');
} finally {
  await crowded.close();
}

// a layout saved before this widget existed puts it under Unsorted, and one that moved it keeps it there
const old = await launch({
  boards: [board(2)],
  open: 'b',
  settings: { layout: { left: ['layers', 'colors'], right: ['tray'] } },
});
try {
  assert.deepStrictEqual(
    await kids(old.page, 'sideR'),
    ['tray', 'zoom'],
    'an older saved layout puts zoom under Unsorted',
  );
  assert.deepStrictEqual(old.errors, [], 'and loads without errors');
} finally {
  await old.close();
}

const moved = await launch({
  boards: [board(2)],
  open: 'b',
  settings: { layout: { left: ['layers', 'zoom', 'colors'], right: ['tray'] } },
});
try {
  const { page: p } = moved;
  assert.deepStrictEqual(
    await kids(p, 'side'),
    ['boards', 'layers', 'zoom', 'colors'],
    'a saved place for zoom is kept',
  );

  await p.click('#gearBtn');
  await p.click('#setTabs [data-tab="layout"]');
  await p.click('[data-set="wZoom"]');
  await p.click('#setClose');
  await still(p);
  assert.strictEqual(await shown(p), false, 'its switch in Settings → Widgets hides it');
  await p.mouse.click(900, 650);
  await p.keyboard.press('Control+=');
  await p.waitForFunction(
    () =>
      document.getElementById('zoom')?.textContent !== '100%' &&
      !document.getElementById('stage')?.classList.contains('moving'),
  );
  assert.notStrictEqual(await p.textContent('#zoom'), '100%', 'and the keyboard still zooms');
  assert.deepStrictEqual(moved.errors, [], 'no errors on the page');
  console.log('zoomWidget: ok');
} finally {
  await moved.close();
}
