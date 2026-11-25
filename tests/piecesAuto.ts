// Selecting a screen opens the Pieces picker beside it without taking the keyboard, so Delete still acts on the
// screen. Selecting another screen moves it there; several screens or nothing open nothing. Pieces hides it and stops
// it opening by itself, which outlasts a restart, and Pieces again brings both back. On a phone nothing opens by itself.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { wireframeBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-pieces-'));
const start = (settings: Record<string, unknown> = {}) =>
  launch({ boards: [wireframeBoard()], open: 'wire', data, settings });

const open = (page: Page) => page.evaluate(() => !document.getElementById('piecePick')?.hidden);
const ids = (page: Page) => page.evaluate(() => window.__fenmyr.curBoard()?.cards.map(c => c.id) ?? []);
const focusIn = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return a instanceof HTMLElement ? a.id || a.tagName.toLowerCase() : '';
  });
const select = async (page: Page, sel: string[]) => {
  await page.evaluate(s => window.__fenmyr.selectOnly(s), sel);
  await still(page);
};
// the screen's box on the page, and whether the picker sits beside it: clear of it side to side, level with it
const beside = async (page: Page, id: string) => {
  const p = await rect(page, '#piecePick'),
    s = await page.evaluate(i => {
      const c = window.__fenmyr.curBoard()?.cards.find(c => c.id === i),
        v = window.__fenmyr.view,
        st = document.getElementById('stage')?.getBoundingClientRect();
      if (!c || !st) throw new Error(`no ${i}`);
      return { l: st.left + v.x + c.x * v.z, r: st.left + v.x + (c.x + c.w) * v.z, t: st.top + v.y + c.y * v.z };
    }, id);
  return (p.x >= s.r - 1 || p.x + p.width <= s.l + 1) && p.y < s.t + 200 && p.y + p.height > s.t;
};
const pieces = (page: Page) => page.getAttribute('#selbar [data-pieces]', 'aria-expanded');

let l = await start();
try {
  let { page } = l;
  await select(page, []);
  const e = await page.evaluate(() => {
    const c = window.__fenmyr.curBoard()?.cards.find(c => c.id === 'empty'),
      v = window.__fenmyr.view,
      st = document.getElementById('stage')?.getBoundingClientRect();
    if (!c || !st) throw new Error('no empty screen');
    return { x: st.left + v.x + (c.x + c.w / 2) * v.z, y: st.top + v.y + (c.y + c.h * 0.15) * v.z };
  });
  await page.mouse.click(e.x, e.y);
  await still(page);
  assert.deepStrictEqual(
    [await open(page), await beside(page, 'empty'), await pieces(page)],
    [true, true, 'true'],
    'clicking a screen opens the picker beside it, and Pieces says so',
  );
  assert.notStrictEqual(await focusIn(page), 'pkSearch', 'the search does not take the keyboard');
  await page.keyboard.press('Delete');
  await still(page);
  assert.ok(!(await ids(page)).includes('empty'), 'Delete removes the screen');
  assert.ok(!(await open(page)), 'and the picker goes with it');

  await select(page, ['signin']);
  assert.ok((await open(page)) && (await beside(page, 'signin')), 'selecting a screen opens the picker beside it');
  await select(page, ['desk']);
  assert.ok((await open(page)) && (await beside(page, 'desk')), 'selecting another screen moves it there');
  await select(page, ['signin', 'desk']);
  assert.ok(!(await open(page)), 'two screens selected open nothing');
  await select(page, []);
  assert.ok(!(await open(page)), 'nothing selected opens nothing');

  await select(page, ['signin']);
  await page.click('#selbar [data-pieces]');
  await still(page);
  assert.deepStrictEqual([await open(page), await pieces(page)], [false, 'false'], 'Pieces hides the picker');
  await select(page, []);
  await select(page, ['signin']);
  assert.ok(!(await open(page)), 'once hidden with Pieces, selecting the screen again leaves it hidden');
  await select(page, ['desk']);
  assert.ok(!(await open(page)), 'and so does selecting another screen');

  // a test launch writes its own settings over what was saved, so the next one starts from what this one saved
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('fenmyr:settings') ?? '{}'));
  assert.deepStrictEqual(l.errors, []);
  await l.close();
  l = await start(saved);
  page = l.page;
  await select(page, ['signin']);
  assert.ok(!(await open(page)), 'after a restart, selecting a screen still leaves the picker hidden');

  await page.click('#selbar [data-pieces]');
  await still(page);
  assert.deepStrictEqual(
    [await open(page), await focusIn(page)],
    [true, 'pkSearch'],
    'Pieces brings the picker back, with the cursor in its search',
  );
  await select(page, []);
  await select(page, ['desk']);
  assert.ok((await open(page)) && (await beside(page, 'desk')), 'and selecting a screen opens it by itself again');

  await select(page, []);
  await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(390, 844));
  await page.waitForFunction(() => innerWidth === 390 && document.body.classList.contains('phone'));
  await still(page);
  await select(page, ['signin']);
  assert.ok(!(await open(page)), 'on a phone, selecting a screen opens nothing');
  assert.strictEqual(await pieces(page), 'false', 'Pieces is there to open it');

  assert.deepStrictEqual(l.errors, []);
  console.log('PIECES AUTO OK');
} finally {
  await l.close();
  fs.rmSync(data, { recursive: true, force: true });
}
