// @ts-nocheck
// Zoom: Ctrl + mouse wheel moves one even step per notch, a touchpad pinch stays smooth, Ctrl+0 resets to 100%,
// and the percentage opens the zoom menu (in, out, 100%, fit, quick sizes) with Ctrl shortcuts.
//   node tests/zoom.ts

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { nearestEmptySpot } from '../src/web/canvas/emptySpot.ts';
import { HEADLESS } from './support/launch.ts';

const size = { w: 100, h: 100 },
  centre = { x: 0, y: 0 };
assert.deepStrictEqual(nearestEmptySpot(size, centre, []), { x: -50, y: -50 });
const block = { x: -100, y: -100, w: 200, h: 200 };
assert.deepStrictEqual(nearestEmptySpot(size, { x: 20, y: 0 }, [block]), { x: 160, y: -50 });
assert.deepStrictEqual(nearestEmptySpot(size, { x: 0, y: 90 }, [block]), { x: -50, y: 160 });

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-zoom-'));
  const app = await electron.launch({
    args: [path.join(import.meta.dirname, '..'), '--no-sandbox', ...HEADLESS],
    env: { ...process.env, XDG_DATA_HOME: data, HOME: data },
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(2500);
  await page.getByText('Skip setup').click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  const pct = () => page.evaluate(() => document.getElementById('zoom').textContent);
  const r = {};
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(400);
  r.reset = await pct();
  // the wheel pans up and down; Shift + wheel pans sideways
  {
    const at = () =>
      page.evaluate(() => {
        const m = new DOMMatrix(getComputedStyle(document.getElementById('world')).transform);
        return [Math.round(m.e), Math.round(m.f)];
      });
    await page.mouse.move(700, 400);
    const p0 = await at();
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(300);
    const p1 = await at();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(300);
    await page.keyboard.up('Shift');
    const p2 = await at();
    r.pan = { wheel: [p1[0] - p0[0], p1[1] - p0[1]], shift: [p2[0] - p1[0], p2[1] - p1[1]] };
  }
  // a mouse wheel: Ctrl held, one notch at a time (Chromium on Linux reports ~120px per notch)
  await page.mouse.move(700, 400);
  await page.keyboard.down('Control');
  const steps = [];
  for (const dy of [-120, -120, -120, 120, 120, 120, 120]) {
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(300);
    steps.push(await pct());
  }
  // a high-resolution wheel: small events that add up to one notch
  await page.keyboard.up('Control');
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(400);
  await page.keyboard.down('Control');
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, -15);
    await page.waitForTimeout(25);
  } // 45px: one notch
  await page.waitForTimeout(300);
  r.hires = await pct();
  await page.keyboard.up('Control');
  // a touchpad pinch: ctrl + wheel without Ctrl held, small deltas
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = document.querySelector('.stage') || document.getElementById('stage');
    for (let i = 0; i < 3; i++)
      s.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -4,
          ctrlKey: true,
          clientX: 700,
          clientY: 400,
          bubbles: true,
          cancelable: true,
        }),
      );
  });
  await page.waitForTimeout(300);
  r.pinch = await pct();
  // a big pinch flick can't jump: at most 5% per event (113% × e^0.05 ≈ 119%)
  await page.evaluate(() => {
    const s = document.querySelector('.stage') || document.getElementById('stage');
    s.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -300,
        ctrlKey: true,
        clientX: 700,
        clientY: 400,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.waitForTimeout(300);
  r.flick = await pct();
  // the percentage opens the zoom menu; "Zoom to 100%" goes back
  await page.click('#zoom');
  await page.waitForTimeout(300);
  r.menu = await page.evaluate(() =>
    [...document.querySelectorAll('#rowMenu button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()),
  );
  await page.locator('#rowMenu button', { hasText: 'Zoom to 100%' }).click();
  await page.waitForTimeout(500);
  r.click = await pct();
  // Ctrl + = steps along the same ladder as the wheel
  await page.keyboard.press('Control+=');
  await page.waitForTimeout(500);
  r.plus = await pct();
  r.steps = steps;
  // a fit that ends zoomed in must not overshoot when the board swaps to real zoom as it settles
  r.fitPeak = await page.evaluate(async () => {
    const H = window.__fenmyr;
    H.newNote();
    const c = H.board.cards.at(-1),
      el = document.querySelector(`.card[data-id="${c.id}"]`),
      widths = [];
    let on = true;
    const tick = () => {
      widths.push(el.getBoundingClientRect().width);
      if (on) requestAnimationFrame(tick);
    };
    H.selectOnly([]);
    Object.assign(H.view, { z: 0.5 });
    H.applyView();
    await new Promise(res => setTimeout(res, 600));
    H.fit([c], 20);
    requestAnimationFrame(tick);
    await new Promise(res => setTimeout(res, 1400));
    on = false;
    return { peak: Math.max(...widths), end: widths.at(-1), z: H.view.z };
  });
  // Templates land in the nearest empty space around the middle of the view, and the view moves only if they'd be off screen.
  r.placed = await page.evaluate(async () => {
    const H = window.__fenmyr,
      wait = ms => new Promise(res => setTimeout(res, ms)),
      template = {
        name: 'T',
        mode: 'add',
        cards: [{ id: 'a', type: 'note', x: 500, y: 700, w: 200, h: 120, color: 'white', text: 'x', r: 0 }],
        links: [],
      };
    const measure = async place => {
      const before = new Set(H.board.cards.map(c => c.id)),
        from = { ...H.view };
      await place();
      await wait(800);
      const made = H.board.cards.filter(c => !before.has(c.id)),
        others = H.board.cards.filter(c => before.has(c.id)),
        overlaps = made.some(m =>
          others.some(o => o.x < m.x + m.w && m.x < o.x + o.w && o.y < m.y + m.h && m.y < o.y + o.h),
        ),
        stage = document.getElementById('stage').getBoundingClientRect(),
        rects = made.map(c => document.querySelector(`.card[data-id="${c.id}"]`).getBoundingClientRect()),
        onScreen = rects.every(
          r => r.left >= stage.left && r.right <= stage.right && r.top >= stage.top && r.bottom <= stage.bottom,
        ),
        viewMoved = from.x !== H.view.x || from.y !== H.view.y || from.z !== H.view.z;
      return { count: made.length, overlaps, onScreen, viewMoved, zoomedIn: H.view.z > from.z, x: made[0]?.x };
    };
    const setView = async view => {
      Object.assign(H.view, view);
      H.applyView();
      await wait(600);
    };
    const r = {};
    // Plenty of room: an empty board's worth of space in view, so nothing moves.
    for (const c of H.board.cards) c.x -= 9000;
    H.renderAll();
    await setView({ x: 0, y: 0, z: 0.5 });
    r.room = await measure(() => H.useTemplate(template, 'add'));
    // The same through the built-in templates, which are placed by different code.
    r.builtIn = await measure(async () => {
      document.querySelector('#tools [data-add="tpl"]').click();
      await wait(100);
      document.querySelector('[data-tpl="kanban"]').click();
    });
    // Something huge fills the view: the template has to go off screen, so the view follows without zooming in.
    H.newNote();
    const wall = H.board.cards.at(-1);
    Object.assign(wall, { x: -4000, y: -4000, w: 8000, h: 8000 });
    H.renderCard(wall);
    H.selectOnly([]);
    await setView({ x: 0, y: 0, z: 0.8 });
    r.follow = await measure(() => H.useTemplate(template, 'add'));
    return r;
  });
  r.errors = errors;
  await page.screenshot({ path: path.join(data, 'zoom.png'), clip: { x: 250, y: 800, width: 900, height: 100 } });
  console.log(JSON.stringify(r), '\n  toolbar:', path.join(data, 'zoom.png'));
  await app.close();
  const { room, builtIn, follow } = r.placed;
  const placedOk =
    room.count === 1 &&
    !room.overlaps &&
    room.onScreen &&
    !room.viewMoved &&
    builtIn.count > 1 &&
    !builtIn.overlaps &&
    follow.count === 1 &&
    !follow.overlaps &&
    follow.onScreen &&
    follow.viewMoved &&
    !follow.zoomedIn;
  const ok =
    placedOk &&
    r.reset === '100%' &&
    r.pan.wheel[0] === 0 &&
    r.pan.wheel[1] === -100 &&
    r.pan.shift[0] === -100 &&
    r.pan.shift[1] === 0 &&
    JSON.stringify(steps) === JSON.stringify(['110%', '125%', '150%', '125%', '110%', '100%', '90%']) &&
    r.hires === '110%' &&
    r.pinch === '113%' &&
    r.flick === '119%' &&
    r.click === '100%' &&
    r.plus === '110%' &&
    r.menu.includes('Zoom in Ctrl++') &&
    r.menu.includes('Zoom to 100% Ctrl+0') &&
    !r.menu.join().includes('⌘') &&
    r.fitPeak.z > 1.02 &&
    r.fitPeak.peak < r.fitPeak.end * 1.02 &&
    !errors.length;
  console.log(ok ? 'ZOOM OK' : 'ZOOM FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
