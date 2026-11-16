// When the changes counter updates: it comes back after a restart, each prototype shows its own as you switch between
// them, it keeps counting this prototype's newest build while another prototype builds and while this one's request
// waits its turn, it hides once this prototype's build starts, and a build that lands while its board is closed shows
// when the board opens.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatMsg } from '../src/shared/chat.ts';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-dock-changes-when-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-dock-changes-when-data-'));
const start = async () => {
  const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
  return { l, standIn: buildStandIn(l) };
};
let { l, standIn } = await start();
const page = () => l.page;

const counter = () =>
  page().evaluate(() => {
    const c = document.getElementById('mcChanges');
    return c?.checkVisibility() ? (c.textContent ?? '') : null;
  });
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page().waitForTimeout(100);
  }
  assert.fail(`${what}: the counter reads ${JSON.stringify(await counter())}`);
};
const open = async (id: string) => {
  await page().evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page(), 800);
};
const ask = (request: string) =>
  page().evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const kept = (id: string): ChatMsg[] =>
  JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', `${id}.json`), 'utf8')).chat ?? [];
// whether the board's file keeps an end for the build asked for with `request`
const ended = (id: string, request: string) =>
  kept(id)
    .flatMap(m => m.acts ?? [])
    .some(a => a.kind === 'build' && a.request === request && !!a.end);
const files = (n: number, tag: string) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`src/Part${i}.tsx`, `export const P${i} = () => <p>${tag}</p>;\n`]),
  );

try {
  await page().evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    for (const { id, name } of [
      { id: 'pb', name: 'Checkout' },
      { id: 'pc', name: 'Basket' },
    ]) {
      const proto = await window.Fenmyr.protoCreate({ root: repo, name, stack: 'react' });
      await window.Fenmyr.save({ id, name, folder: 'pf', kind: 'prototype', proto, cards: [], links: [], tray: [] });
    }
    await window.__fenmyr.refreshBoards();
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');

  await open('pb');
  standIn.next({ files: files(2, 'one'), reply: 'Done.' });
  await ask('Two parts.');
  await until(async () => (await counter()) === '2 changes', 'the first build is counted');

  await l.close();
  ({ l, standIn } = await start());
  await open('pb');
  assert.strictEqual(await counter(), '2 changes', 'after a restart it counts the newest build again');

  await open('pc');
  assert.strictEqual(await counter(), null, 'a prototype with no build shows none');
  await open('pb');
  assert.strictEqual(await counter(), '2 changes', 'and switching back shows this one’s again');

  await open('pc');
  standIn.next({ files: files(1, 'basket'), reply: 'Done.', hold: true });
  await ask('A basket part.');
  await until(() => standIn.wrote() === 1, 'the other prototype’s build writes');
  await open('pb');
  assert.strictEqual(await counter(), '2 changes', 'while another prototype builds it counts this one’s newest build');
  standIn.next({ files: files(3, 'two'), reply: 'Done.', ms: 3000 });
  await ask('Three parts.');
  await settle(page(), 600);
  await open('one');
  await open('pb');
  assert.strictEqual(
    await counter(),
    '2 changes',
    'while this one’s request waits its turn it still counts the last build',
  );
  standIn.release();
  await until(async () => (await counter()) === null, 'once this one’s build starts it is hidden');
  await until(async () => (await counter()) === '3 changes', 'and when that build lands it counts that build');
  assert.ok(ended('pc', 'A basket part.'), 'the other prototype’s build landed on its own board');

  standIn.next({ files: files(1, 'three'), reply: 'Done.', ms: 2000 });
  await ask('One part.');
  await until(async () => (await counter()) === null, 'the build starts');
  await open('one');
  await until(() => ended('pb', 'One part.'), 'the build lands while its board is closed');
  await open('pb');
  assert.strictEqual(await counter(), '1 change', 'opening the board shows the build that landed while it was closed');
  assert.deepStrictEqual(l.errors, []);
  console.log('DOCK CHANGES WHEN OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
