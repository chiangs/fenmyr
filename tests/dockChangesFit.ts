// The changes counter's click lands on a code pane fitted to the width it shows at. Tabs never run past the end of
// their row once the dots widen them, and a code column folded as the build landed opens on the file picker when its
// tabs don't fit.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-dock-fit-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-dock-fit-data-'));
const l = await launch({
  data,
  boards: [replyBoard('one', 'One')],
  open: 'one',
  claude: true,
  settings: { motion: true },
});
const { page } = l;
const standIn = buildStandIn(l);

const head = () =>
  page.evaluate(() => {
    const pane = document.getElementById('pr-code'),
      files = pane?.querySelector<HTMLElement>('.pc-files'),
      act = document.activeElement instanceof HTMLElement ? document.activeElement : null,
      many = !!pane?.classList.contains('pc-many');
    return {
      folded: !!pane?.closest('.folded'),
      tabs: !many,
      overflow: files && !many ? files.scrollWidth - files.clientWidth : 0,
      width: Math.round(pane?.getBoundingClientRect().width ?? 0),
      menu: !!document.querySelector('.pc-menu'),
      focused: act?.dataset.file ?? (act?.id || act?.className || ''),
      focusIn: act?.closest('.pc-menu') ? 'menu' : act?.closest('.pc-files') ? 'tabs' : '',
    };
  });
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await head())}`);
};
const land = async (request: string, files: Record<string, string>) => {
  standIn.next({ files, reply: `Done: ${request}` });
  await page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
  await until(
    () => page.evaluate(t => !!document.getElementById('mcList')?.textContent?.includes(t), `Done: ${request}`),
    `the build “${request}” lands`,
  );
  await settle(page, 600);
};
const part = (n: string) => [`src/${n}.tsx`, `export const ${n} = () => <p>${n}</p>;\n`];

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout',
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
  git('add', '-A');
  git('commit', '-qm', 'start');
  await settle(page, 1500);

  await land('Three files.', Object.fromEntries(['App', 'Form', 'Total'].map(part)));
  const d = await page.locator('.pr-div[data-d="code"]').boundingBox();
  assert.ok(d, 'the code column has a divider');
  const x = d.x + d.width / 2,
    y = d.y + 300;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const clipped: string[] = [];
  let sawTabs = false,
    sawPicker = false;
  // from wide to narrow, across the width where the dotted tabs stop fitting
  for (let dx = -240; dx <= 100; dx += 2) {
    await page.mouse.move(x + dx, y);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const h = await head();
    sawTabs ||= h.tabs;
    sawPicker ||= !h.tabs;
    if (h.overflow > 0) clipped.push(`${h.width}px:+${h.overflow}`);
  }
  await page.mouse.up();
  assert.ok(sawTabs && sawPicker, 'the drag crosses from tabs to the picker');
  assert.deepStrictEqual(clipped, [], 'at no width do the dotted tabs run past the end of their row');

  await page.click('[data-fold="code"]');
  await until(async () => (await head()).folded, 'the code column folds');
  await land('Five parts.', Object.fromEntries(['Form', 'Total', 'Receipt', 'Coupon', 'Basket'].map(part)));
  await page.click('#mcChanges');
  await until(async () => !(await head()).folded, 'a click unfolds the code column');
  await until(async () => (await head()).focused === 'src/Basket.tsx', 'focus lands on the first changed file');
  const h = await head();
  assert.ok(!h.tabs, 'a column folded as the build landed opens on the picker, since its tabs don’t fit');
  assert.strictEqual(h.focusIn, 'menu', 'with focus in the picker’s menu');

  assert.deepStrictEqual(l.errors, []);
  console.log('DOCK CHANGES FIT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
