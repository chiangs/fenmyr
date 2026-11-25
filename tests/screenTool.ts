// The screen tool: W or the bottom bar's Wireframe button puts it in hand with a row of devices in the mode bar. A click
// places the lit device's screen, a drag draws a Custom one, and keys, the row and Esc work it. The row's Box and Text
// swap one tool for another. R and X still draw on the bare board, and on a phone the + sheet starts it and a tap places
// a screen centred on the tap.
import assert from 'node:assert';
import fs from 'node:fs';
import { nounOf } from '../src/shared/cardTypes.ts';
import { calm } from './support/calm.ts';
import { launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

assert.strictEqual(nounOf({ type: 'frame' }, 2), 'screens', 'two frames are called screens');

const far = { id: 'far', type: 'note', x: -4000, y: -4000, w: 220, h: 120, r: 0, color: 'white', text: 'far away' };
// each screen placed is selected, and the Pieces picker it would open sits where the next one is placed
const board = { id: 'wf', name: 'Wire', cards: [far], links: [], tray: [], view: { x: 0, y: 0, z: 0.25 } };
const l = await launch({ boards: [board], open: 'wf', settings: { autoPieces: false } });
const { page } = l;
const { work, repo } = freshRepo('fenmyr-screen-');
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const fresh = async (id: string, z = 0.25) => {
  await page.keyboard.press('Escape');
  await page.evaluate(
    async ([id, z]) => {
      await window.Fenmyr.save({ id, name: id, cards: [], links: [], tray: [], view: { x: 0, y: 0, z } });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openBoard(id);
      Object.assign(window.__fenmyr.view, { x: 0, y: 0, z });
      window.__fenmyr.applyView();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    },
    [id, z] as const,
  );
  await calm(page);
};
const tool = async () => {
  await frames();
  return page.evaluate(() => {
    const g = document.getElementById('ghost'),
      row = document.getElementById('screenbar');
    return {
      inHand: !!g?.classList.contains('frame'),
      ghost: `${g?.style.width} × ${g?.style.height}`,
      row: !!row?.checkVisibility(),
      lit: [...(row?.querySelectorAll('.on') ?? [])].map(b => (b instanceof HTMLElement ? b.dataset.dev : '')).join(),
    };
  });
};
const down = { inHand: false, ghost: '', row: false, lit: '' };
// aria-pressed on the row's Box and Text, then on the bottom bar's Wireframe button
const pressed = async () => {
  await frames();
  return page.evaluate(() =>
    [...document.querySelectorAll('#screenbar [data-wft]'), document.querySelector('#tools [data-add="frame"]')]
      .map(b => b?.getAttribute('aria-pressed'))
      .join(' '),
  );
};
const count = () => page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
const last = () =>
  page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.at(-1);
    if (!c) return null;
    const own = c.type === 'frame' ? { name: c.name, device: c.device, radius: c.radius } : {};
    return {
      type: c.type,
      w: c.w,
      h: c.h,
      ...own,
      selected: window.__fenmyr.sel.includes(c.id),
      on: c.onFrame ?? null,
    };
  });
const stage = async () => {
  const r = await page.locator('#stage').boundingBox();
  if (!r) throw new Error('no stage');
  return r;
};
const at = async (fx: number, fy: number) => {
  const s = await stage();
  return { x: s.x + s.width * fx, y: s.y + s.height * fy };
};
const click = async (fx: number, fy: number) => {
  const p = await at(fx, fy);
  await page.mouse.click(p.x, p.y);
  await calm(page);
};
const drag = async (fx: number, fy: number, dx: number, dy: number) => {
  const p = await at(fx, fy);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx / 2, p.y + dy / 2, { steps: 4 });
  const during = await tool();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 4 });
  await page.mouse.up();
  await calm(page);
  return during;
};
const key = async (k: string) => {
  await page.keyboard.press(k);
  await frames();
};
const label = async () => {
  await frames();
  return page.evaluate(() => document.querySelector('#selbar .sb-label')?.textContent ?? '');
};
const said = () =>
  page.evaluate(
    () =>
      !!document.getElementById('mBubble')?.classList.contains('on') &&
      /Want to see these working\?/.test(document.getElementById('mSay')?.textContent ?? ''),
  );

try {
  await fresh('first');
  await key('w');
  assert.deepStrictEqual(
    await tool(),
    { inHand: true, ghost: '393px × 852px', row: true, lit: 'iPhone' },
    'W puts the screen tool in hand with iPhone lit',
  );
  assert.strictEqual(await pressed(), 'false false true', "only the bottom bar's Wireframe button is pressed");
  await click(0.4, 0.3);
  assert.deepStrictEqual(
    await last(),
    { type: 'frame', w: 393, h: 852, name: 'Screen', device: 'iPhone', radius: 44, selected: true, on: null },
    'a click places an iPhone screen, selected',
  );
  assert.strictEqual(await label(), 'Screen', 'the bar calls it a screen');
  assert.deepStrictEqual({ ...(await tool()), ghost: '' }, down, 'and the tool goes down');
  assert.ok(!(await said()), 'one screen raises no prototype offer');
  await key('w');
  await click(0.6, 0.3);
  await page.waitForFunction(() =>
    /Want to see these working\?/.test(document.getElementById('mSay')?.textContent ?? ''),
  );

  await fresh('row');
  await key('w');
  await page.click('#screenbar [data-dev="iPhone"]');
  await page.click('#screenbar [data-dev="iPad"]');
  assert.deepStrictEqual(
    await tool(),
    { inHand: true, ghost: '834px × 1194px', row: true, lit: 'iPad' },
    'iPhone then iPad keeps the tool in hand with iPad lit',
  );
  await page.hover('#screenbar [data-dev="Watch"]');
  await calm(page);
  assert.ok(
    await page.evaluate(
      () => getComputedStyle(document.getElementById('ghost') ?? document.body).visibility === 'hidden',
    ),
    'pointing at the row hides the ghost',
  );
  await click(0.4, 0.2);
  assert.deepStrictEqual(
    await last(),
    { type: 'frame', w: 834, h: 1194, name: 'Screen', device: 'iPad', radius: 20, selected: true, on: null },
    'a click places an iPad screen',
  );
  await key('w');
  await drag(0.7, 0.6, 4, 3);
  assert.deepStrictEqual(
    await last(),
    { type: 'frame', w: 834, h: 1194, name: 'Screen', device: 'iPad', radius: 20, selected: true, on: null },
    'zoomed out, a press that slips a few pixels is still a click',
  );
  await key('r');
  await page.click('#screenbar [data-wft="text"]');
  assert.strictEqual(await pressed(), 'false true true', "R's box then the row's Text swaps one for the other");
  await page.click('#screenbar [data-wft="text"]');
  assert.deepStrictEqual({ ...(await tool()), ghost: '' }, down, "and the row's Text again puts it down");
  await page.keyboard.press('Escape');

  await fresh('keys');
  await key('w');
  await key('4');
  assert.deepStrictEqual(
    await tool(),
    { inHand: true, ghost: '1440px × 1024px', row: true, lit: 'Desktop' },
    'W then 4 lights Desktop',
  );
  await click(0.3, 0.2);
  assert.deepStrictEqual(
    await last(),
    { type: 'frame', w: 1440, h: 1024, name: 'Desktop', device: 'Desktop', radius: 10, selected: true, on: null },
    'a click places a Desktop screen named Desktop',
  );
  await key('Escape');
  const before = await count();
  await key('w');
  await key('Enter');
  const middle = await page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.at(-1),
      v = window.__fenmyr.view,
      s = document.getElementById('stage')?.getBoundingClientRect(),
      l = document.getElementById('side')?.getBoundingClientRect(),
      r = document.getElementById('sideR')?.getBoundingClientRect();
    if (!c || !s || !l || !r) return null;
    return {
      dx: Math.abs(s.left + v.x + (c.x + c.w / 2) * v.z - (l.right + r.left) / 2),
      dy: Math.abs(s.top + v.y + (c.y + c.h / 2) * v.z - (s.top + s.height / 2)),
    };
  });
  assert.strictEqual(await count(), before + 1, 'W then Enter places a screen');
  assert.ok(middle && middle.dx < 60 && middle.dy < 30, `in the middle of the free board: ${JSON.stringify(middle)}`);
  await key('Escape');
  await page.click('#tools [data-add="frame"]');
  assert.deepStrictEqual(
    await tool(),
    { inHand: true, ghost: '1440px × 1024px', row: true, lit: 'Desktop' },
    "the bottom bar's Wireframe button puts up the same tool, with the board's last device",
  );
  await page.click('#tools [data-add="frame"]');
  assert.deepStrictEqual({ ...(await tool()), ghost: '' }, down, 'and a second press puts it down');

  await fresh('drag', 1);
  await key('w');
  const during = await drag(0.3, 0.1, 300, 500);
  assert.deepStrictEqual(
    { ...during, ghost: '' },
    { inHand: false, ghost: '', row: true, lit: 'iPhone' },
    'while drawing, the ghost goes and the row stays',
  );
  assert.deepStrictEqual(
    await last(),
    { type: 'frame', w: 300, h: 500, name: 'Screen', device: 'Custom', radius: 0, selected: true, on: null },
    'a drag draws a Custom screen of its size',
  );
  await key('w');
  await drag(0.6, 0.1, 20, 20);
  assert.deepStrictEqual(
    await last(),
    { type: 'frame', w: 120, h: 120, name: 'Screen', device: 'Custom', radius: 0, selected: true, on: null },
    'a small drag makes 120 × 120',
  );

  await fresh('defaults');
  await key('w');
  await key('4');
  await click(0.3, 0.2);
  const desktop = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.at(-1)?.id ?? '');
  await key('Escape');
  await key('w');
  await key('1');
  await click(0.6, 0.2);
  await page.evaluate(id => window.__fenmyr.selectOnly([id]), desktop);
  await key('w');
  assert.strictEqual((await tool()).lit, 'Desktop', 'a selected Desktop screen lights Desktop');
  await key('Escape');
  await key('Escape');
  await key('w');
  assert.strictEqual((await tool()).lit, 'iPhone', 'with nothing selected, the screen added last');
  await key('4');
  await click(0.5, 0.6);
  await key('Escape');
  await key('w');
  await drag(0.65, 0.6, 60, 60);
  await key('Escape');
  await key('w');
  assert.strictEqual((await tool()).lit, 'Desktop', 'a Custom screen added last is skipped');
  await key('Escape');

  const kept = await count();
  for (const [how, put] of [
    ['W again', () => key('w')],
    ['Esc', () => key('Escape')],
    ['×', () => page.click('#scX')],
    ['V', () => key('v')],
    ['N', () => key('n')],
    ['Home', () => page.click('#homeBtn')],
  ] as const) {
    await key('w');
    assert.ok((await tool()).inHand, `in hand before ${how}`);
    await put();
    assert.deepStrictEqual({ ...(await tool()), ghost: '' }, down, `${how} puts the tool down`);
  }
  await key('Escape');
  assert.strictEqual(await count(), kept, 'and adds nothing');
  await page.evaluate(() => document.getElementById('mBubble')?.classList.remove('on'));
  await key('w');
  await click(0.3, 0.75);
  assert.strictEqual(await count(), kept + 1, 'a screen placed');
  assert.ok(!(await said()), 'the prototype offer comes once');
  await key('r');
  const b = await at(0.55, 0.05);
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + 30, { steps: 2 });
  await page.mouse.up();
  await key('w');
  await key('Enter');
  await calm(page);
  await page.keyboard.press('Control+z');
  await calm(page);
  assert.deepStrictEqual(
    { n: await count(), last: (await last())?.type },
    { n: kept + 2, last: 'box' },
    'undo takes back the screen Enter placed, and not the box drawn just before it',
  );

  await fresh('guards', 1);
  await key('w');
  await drag(0.25, 0.1, 400, 600);
  const screen = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.at(-1)?.id ?? '');
  await key('Escape');
  await key('r');
  await drag(0.6, 0.2, 160, 90);
  assert.deepStrictEqual(
    await last(),
    { type: 'box', w: 160, h: 90, selected: true, on: null },
    'R draws a box on the bare board',
  );
  await key('r');
  await key('w');
  assert.strictEqual(await pressed(), 'false false true', "W puts out R's box, and the row's Box is not pressed");
  await key('Escape');
  await key('r');
  await drag(0.3, 0.2, 100, 60);
  assert.deepStrictEqual(
    await last(),
    { type: 'box', w: 100, h: 60, selected: true, on: screen },
    'and on a screen it files into it',
  );
  await key('x');
  await click(0.6, 0.6);
  const typing = await page.evaluate(() => window.__fenmyr.editing === window.__fenmyr.curBoard()?.cards.at(-1)?.id),
    text = await last();
  assert.deepStrictEqual(
    { type: text?.type, on: text?.on, typing },
    { type: 'text', on: null, typing: true },
    'X then a click starts a text on the bare board',
  );
  await key('Escape');
  await key('x');
  await click(0.3, 0.35);
  assert.strictEqual((await last())?.on, screen, 'a text on a screen files into it');
  await key('Escape');
  await key('Escape');
  await key('w');
  await click(0.28, 0.15);
  assert.strictEqual(
    (await last())?.on,
    null,
    'a screen placed on a screen sits on no screen, as one moved there does',
  );

  await key('Escape');
  await openPrototype(page, repo);
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.kind === 'prototype');
  await calm(page);
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await key('w');
  await key('Enter');
  assert.strictEqual(await last().then(c => c?.type), 'frame', 'on a prototype board W makes a screen');

  await page.evaluate(() => window.__fenmyr.openBoard('first'));
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await page.waitForFunction(() => innerWidth === 390 && document.body.classList.contains('phone'));
  await calm(page);
  await page.evaluate(() => {
    Object.assign(window.__fenmyr.view, { x: 0, y: 0, z: 0.2 });
    window.__fenmyr.applyView();
  });
  await page.click('[data-sheet="add"]');
  await page.click('#shBody [data-add="frame"]');
  await calm(page);
  const sheet = await page.evaluate(() => ({
    sheetOpen: !!document.getElementById('sheet')?.classList.contains('on'),
    inDock: document.getElementById('screenbar')?.closest('#dock') !== null,
    shown: !!document.getElementById('screenbar')?.checkVisibility(),
  }));
  assert.deepStrictEqual(
    sheet,
    { sheetOpen: false, inDock: true, shown: true },
    'on a phone, Wireframe closes the sheet and shows the row in the dock',
  );
  const tap = await at(0.5, 0.4);
  await page.mouse.click(tap.x, tap.y);
  await calm(page);
  const centre = await page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.at(-1),
      v = window.__fenmyr.view,
      s = document.getElementById('stage')?.getBoundingClientRect();
    return c && s
      ? { type: c.type, x: s.left + v.x + (c.x + c.w / 2) * v.z, y: s.top + v.y + (c.y + c.h / 2) * v.z }
      : null;
  });
  assert.ok(
    centre?.type === 'frame' && Math.abs(centre.x - tap.x) < 2 && Math.abs(centre.y - tap.y) < 2,
    `a tap places a screen centred on it: ${JSON.stringify({ centre, tap })}`,
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('SCREEN TOOL OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
