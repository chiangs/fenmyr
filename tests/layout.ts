// The prototype board's screen: Myra docked open on the left, the git bar, the code pane, folding columns, and plain
// boards untouched.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-layout-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(repo);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'People miss the promo field' };
const l = await launch({ boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }], open: 'plain' });
const { page } = l;
const state = () =>
  page.evaluate(() => {
    const rect = (s: string) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? [Math.round(r.left), Math.round(r.width)] : null;
    };
    return {
      proto: document.body.classList.contains('proto'),
      docked: document.getElementById('mChat')?.parentElement?.id,
      chatOpen: document.getElementById('myra')?.classList.contains('chat'),
      folded: [...document.querySelectorAll('.pr-pane.folded')].map(p => p.getAttribute('data-p')),
      git: document.getElementById('prGit')?.textContent ?? '',
      code: document.querySelector('.pc-text')?.textContent ?? '',
      stage: rect('#stage'),
      slot: rect('[data-p="canvas"] .pr-body'),
    };
  });
const resize = (w: number) =>
  l.app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 900), w);

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout flow', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout flow',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  await page.waitForTimeout(800);
  let s = await state();
  assert.ok(s.proto && s.docked === 'prChat' && s.chatOpen, 'a prototype board docks Myra’s chat open on the left');
  assert.deepStrictEqual(s.folded, [], 'at 1440 px every column shows');
  assert.match(
    s.git,
    /acme\s*main\s*\d+ changes\s*Only on this computer/,
    'the git bar names the repo, branch, changes and sync',
  );
  assert.match(s.code, /<div id="root"><\/div>/, 'the code pane opens on index.html');
  assert.deepStrictEqual(s.stage, s.slot, 'the canvas sits exactly in its column');

  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('mcClose')?.click());
  assert.ok((await state()).chatOpen, 'neither Esc nor the close button closes it');

  await page.click('.pc-file:has-text("src/App.tsx")');
  await page.waitForTimeout(300);
  assert.match((await state()).code, /export function App/, 'picking a file shows it');

  await page.click('[data-fold="code"]');
  await page.waitForTimeout(300);
  s = await state();
  assert.deepStrictEqual(s.folded, ['code'], 'the code column folds to a strip');
  assert.deepStrictEqual(s.stage, s.slot, 'and the canvas follows its column');
  await page.click('[data-open="code"]');

  await resize(1200);
  await page.waitForTimeout(500);
  assert.deepStrictEqual((await state()).folded, ['canvas'], 'a narrower window folds the canvas first');
  await resize(760);
  await page.waitForTimeout(500);
  assert.deepStrictEqual((await state()).folded, ['code', 'canvas'], 'then the code');
  await resize(1440);

  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForTimeout(500);
  s = await state();
  assert.ok(
    !s.proto && s.docked === 'myra' && !s.chatOpen,
    'a plain board gets the chat back under Myra’s button, closed',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('LAYOUT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
