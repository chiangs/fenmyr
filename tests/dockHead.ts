// The docked chat's header on a prototype board: the board's name over its stack and the status line, kept up to date
// by both ways of renaming a board, while the chat keeps Myra's name and ordinary boards show only hers.
import assert from 'node:assert';
import fs from 'node:fs';
import { launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-dock-head-');
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'People miss the promo field' };
const l = await launch({ boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }], open: 'plain' });
const { page } = l;
const head = () =>
  page.evaluate(() => {
    const el = (id: string) => document.getElementById(id);
    const box = (id: string) => {
      const r = el(id)?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: r.left, right: r.right } : null;
    };
    const shown = (id: string) => !!el(id)?.checkVisibility() && (el(id)?.getBoundingClientRect().width ?? 0) > 1;
    return {
      name: shown('mcBoardName') ? (el('mcBoardName')?.textContent ?? '') : null,
      stack: shown('mcStack') ? (el('mcStack')?.textContent ?? '') : null,
      myra: shown('mcHeadName') ? (el('mcHeadName')?.textContent ?? '') : null,
      status: shown('mcStatus'),
      nameBox: box('mcBoardName'),
      stackBox: box('mcStack'),
      statusBox: box('mcStatus'),
    };
  });

try {
  await openPrototype(page, repo);
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await page.waitForTimeout(600);

  let h = await head();
  assert.strictEqual(h.name, 'Checkout flow', 'the header names the prototype');
  assert.strictEqual(h.stack, 'Prototype · React', 'and says it’s a React prototype');
  assert.strictEqual(h.myra, null, 'Myra’s name gives way to the board’s');
  assert.ok(h.status, 'the status line still shows');
  assert.ok(
    h.nameBox && h.stackBox && h.statusBox && h.nameBox.bottom <= h.stackBox.top,
    'the name sits on its own line, over the stack',
  );
  assert.ok(
    h.statusBox && h.stackBox && h.statusBox.left >= h.stackBox.right && h.statusBox.top < h.stackBox.bottom,
    'the status line follows the stack on the same line',
  );
  assert.match(
    await page.locator('#mChat').ariaSnapshot(),
    /^- region "Myra"/,
    'the chat is still announced by Myra’s name',
  );
  assert.match(
    await page.locator('#mChat .mc-head').ariaSnapshot(),
    /^- text: Myra Checkout flow Prototype · React\n- status:/,
    'a screen reader hears the stack without the dot drawn after it',
  );

  await page.fill('#boardName', 'Basket');
  assert.strictEqual((await head()).name, 'Basket', 'renaming the board in its name field renames the header');

  await page.dblclick('.board-row.on > span');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Basket two');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.name === 'Basket two');
  assert.strictEqual((await head()).name, 'Basket two', 'and so does renaming it in the board list');

  await page.evaluate(async repo => {
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Landing', stack: 'html' });
    await window.Fenmyr.save({
      id: 'hb',
      name: 'Landing',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('hb');
  }, repo);
  await page.waitForTimeout(600);
  h = await head();
  assert.deepStrictEqual([h.name, h.stack], ['Landing', 'Prototype · HTML'], 'a plain HTML prototype says so');

  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForTimeout(600);
  await page.click('#mPill');
  await page.waitForTimeout(400);
  h = await head();
  assert.deepStrictEqual(
    [h.name, h.stack, h.myra, h.status],
    [null, null, 'Myra', true],
    'an ordinary board’s chat shows Myra’s name and the status line, and no board or stack',
  );

  assert.deepStrictEqual(l.errors, []);
  console.log('DOCK HEAD OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
