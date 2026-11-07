// Linking a project to a repo from its menu: a plain folder becomes a repo, git learns who commits, a second project
// can't take the same repo, and unlinking leaves every file in place.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-link-')));
const folder = path.join(work, 'acme');
fs.mkdirSync(folder);
fs.writeFileSync(path.join(folder, 'notes.txt'), 'mine');

const l = await launch({ env: { GIT_CONFIG_NOSYSTEM: '1' } });
await l.app.evaluate(({ dialog }, dir) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
}, folder);
const { page } = l;
const library = () => JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'folders.json'), 'utf8'));
const screen = () => page.evaluate(() => document.querySelector('.rl-body')?.textContent ?? '');
// the dialog turns its buttons off while a step runs and draws the next screen when it's done
const press = async (action: string) => {
  await page.click(`.rl-body [data-a="${action}"]`);
  await page.waitForFunction(
    () => !document.querySelector('.rl-body') || !!document.querySelector('.rl-body button:not([disabled])'),
  );
};
const openMenu = (name: string) =>
  page.evaluate(name => {
    const head = [...document.querySelectorAll('#boards .node.project .node-head')].find(h =>
      h.textContent?.includes(name),
    );
    if (!head) throw new Error(`no project row ${name}`);
    head.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    const item = document.querySelector('#rowMenu [data-m="repo"]');
    return item?.textContent ?? '';
  }, name);

try {
  await page.evaluate(async () => {
    await window.Fenmyr.saveFolders({
      projects: [
        { id: 'p1', name: 'Acme', open: true },
        { id: 'p2', name: 'Lioness', open: true },
      ],
      folders: [],
      order: {},
    });
    await window.__fenmyr.refreshBoards();
  });

  assert.strictEqual(await openMenu('Acme'), 'Link a repo…', 'an unlinked project offers to link one');
  await page.click('#rowMenu [data-m="repo"]');
  assert.match(await screen(), /Choose an empty folder/);
  await press('pick');
  assert.match(await screen(), /isn't a git repo yet/);
  await press('init');
  assert.ok(fs.existsSync(path.join(folder, '.git')), 'the folder is a repo now');
  assert.match(await screen(), /name and email/, 'git asks who commits before linking');

  await page.fill('#rlName', 'Ann Lee');
  await page.fill('#rlEmail', 'not an email');
  await press('identity');
  assert.match(await screen(), /Type an email address/, 'a bad email is explained and the form stays');
  assert.strictEqual(await page.inputValue('#rlName'), 'Ann Lee', 'what was typed is kept');
  await page.fill('#rlEmail', 'ann@example.com');
  await press('identity');
  await page.waitForTimeout(300);
  assert.match(await screen(), /Branch\s*main/);
  assert.match(await screen(), /Only on this computer/);
  assert.deepStrictEqual(library().projects[0].repo, { path: folder }, 'the link is saved with the project');
  assert.deepStrictEqual(
    library().folders.map((f: { name: string; project: string; kind?: string }) => [f.name, f.project, f.kind]),
    [['Prototypes', 'p1', 'prototyping']],
    'linking makes a prototyping folder in the project',
  );
  const who = execFileSync('git', ['-C', folder, 'config', '--local', 'user.email']).toString().trim();
  assert.strictEqual(who, 'ann@example.com', 'the name and email are saved for this repo only');
  await press('done');

  assert.strictEqual(await openMenu('Acme'), 'Repo…', 'a linked project shows its repo');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await openMenu('Lioness');
  await page.click('#rowMenu [data-m="repo"]');
  await press('pick');
  assert.match(await screen(), /“Acme” already uses this repo/, 'two projects never share a repo');
  assert.strictEqual(library().projects[1].repo, undefined);
  await press('done');

  await openMenu('Acme');
  await page.click('#rowMenu [data-m="repo"]');
  await page.waitForTimeout(500);
  await press('unlink');
  assert.match(await screen(), /Nothing is deleted/);
  await press('unlinkYes');
  assert.strictEqual(library().projects[0].repo, undefined, 'unlinking forgets the link');
  assert.ok(
    fs.existsSync(path.join(folder, 'notes.txt')) && fs.existsSync(path.join(folder, '.git')),
    'and keeps every file',
  );

  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'The button below opens it.', openRepo: 'acme' }, 'link acme'),
  );
  await page.locator('button:visible', { hasText: 'Link “Acme” to a repo' }).first().click();
  await page.waitForTimeout(300);
  assert.match(await screen(), /Choose an empty folder/, 'Myra’s button opens the project’s repo dialog');
  await press('done');

  const old = path.join(folder, 'prototypes', 'old-flow');
  fs.mkdirSync(path.join(old, 'src'), { recursive: true });
  fs.writeFileSync(path.join(old, 'index.html'), '<!doctype html><title>Old flow</title>');
  fs.writeFileSync(path.join(old, 'src', 'main.tsx'), '');
  fs.mkdirSync(path.join(folder, 'prototypes', 'node_modules'));
  await openMenu('Acme');
  await page.click('#rowMenu [data-m="repo"]');
  await press('pick');
  await page.waitForFunction(() => document.querySelector('.rl-body')?.textContent?.includes('Online copy'));
  const boards = () =>
    fs
      .readdirSync(path.join(l.data, 'fenmyr', 'boards'))
      .map(f => JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', f), 'utf8')))
      .filter(b => b.kind === 'prototype')
      .map(b => [b.name, b.proto.dir, b.proto.stack, b.folder]);
  const into = library().folders.find((f: { kind?: string }) => f.kind === 'prototyping').id;
  await page.waitForFunction(() => document.querySelector('#boards')?.textContent?.includes('Old flow'));
  assert.deepStrictEqual(
    boards(),
    [['Old flow', 'prototypes/old-flow', 'react', into]],
    'a repo’s prototypes get boards when a project links to it',
  );
  await press('done');

  // Templates → Prototype in a project with no repo: link it, then name the prototype, in one go
  const lion = path.join(work, 'lion');
  fs.mkdirSync(lion);
  await l.app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, lion);
  await page.evaluate(() => window.__fenmyr.openHome('project:p2'));
  await page.evaluate(() => document.querySelector<HTMLElement>('#tplPick [data-prototype]')?.click());
  await page.waitForSelector('.rl-body');
  await press('pick');
  await press('init');
  await page.fill('#rlName', 'Lee');
  await page.fill('#rlEmail', 'lee@example.com');
  await press('identity');
  await page.waitForFunction(() => /Online copy/.test(document.querySelector('.rl-body')?.textContent ?? ''));
  await press('done');
  await page.waitForSelector('#npName');
  await page.fill('#npName', 'Sign in');
  await page.click('#npOk');
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.name === 'Sign in');
  assert.deepStrictEqual(
    await page.evaluate(() => {
      const b = window.__fenmyr.curBoard();
      return [b?.kind, b?.cards.filter(c => c.type === 'note').length, b?.cards.some(c => c.type === 'stamp')];
    }),
    ['prototype', 3, true],
    'Templates → Prototype links the repo, makes the folder, and opens a prototype with Myra’s notes',
  );

  await page.evaluate(() => window.__fenmyr.openHome('all'));
  await page.evaluate(() => document.querySelector<HTMLElement>('#tplPick [data-prototype]')?.click());
  await page.waitForSelector('.sp-list');
  assert.deepStrictEqual(
    await page.evaluate(() => [...document.querySelectorAll('.sp-list button')].map(b => b.textContent)),
    ['Acme', 'Lioness', 'A new project'],
    'started outside a project, it asks which one, or a new one',
  );
  await page.keyboard.press('Escape');

  // two screens on a board outside any project: Myra offers to prototype them, once
  await page.evaluate(async () => {
    await window.Fenmyr.save({ id: 'sketch', name: 'Sketches', cards: [], links: [], tray: [] });
    await window.__fenmyr.refreshBoards();
  });
  await page.click('#boards .board-row:has-text("Sketches")');
  await page.waitForFunction(
    () => window.__fenmyr.curBoard()?.id === 'sketch' && !document.getElementById('home')?.classList.contains('on'),
  );
  const stage = await page.locator('#stage').boundingBox();
  if (!stage) throw new Error('no stage');
  for (const x of [0.45, 0.7]) {
    // the first screen is taller than the view, so its selection bar holds at the top, where the second one goes
    await page.evaluate(() => window.__fenmyr.selectOnly([]));
    await page.click('[data-wf="frame"]');
    await page.click('#dzPresets [data-dev="iPhone"]');
    await page.mouse.click(stage.x + stage.width * x, stage.y + 120);
  }
  await page.waitForFunction(() =>
    /Want to see these working\?/.test(document.getElementById('mSay')?.textContent ?? ''),
  );
  await page.evaluate(() => {
    const frame = window.__fenmyr.curBoard()?.cards.find(c => c.type === 'frame');
    if (frame) window.__fenmyr.selectOnly([frame.id]);
  });
  assert.strictEqual(await page.locator('[data-sb="prototype"]').count(), 1, 'a selected screen offers Prototype this');
  await page.locator('#mActs button', { hasText: 'Prototype these screens' }).click();
  await page.waitForSelector('.sp-list');
  await page.click('.sp-list [data-project="p1"]');
  await page.fill('#npName', 'From sketches');
  await page.click('#npOk');
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.name === 'From sketches');
  const made = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard(),
      frames = b?.cards.filter(c => c.type === 'frame') ?? [];
    return { frames: frames.length, selected: frames.every(f => window.__fenmyr.sel.includes(f.id)), kind: b?.kind };
  });
  assert.deepStrictEqual(
    made,
    { frames: 2, selected: true, kind: 'prototype' },
    'the screens are copied into a new prototype, selected for Myra to build from',
  );
  await page.evaluate(() => window.__fenmyr.openBoard('sketch'));
  await page.click('[data-wf="frame"]');
  await page.click('#dzPresets [data-dev="iPhone"]');
  await page.mouse.click(stage.x + stage.width * 0.55, stage.y + 500);
  await page.waitForTimeout(500);
  assert.ok(
    !(await page.evaluate(
      () =>
        document.getElementById('mBubble')?.classList.contains('on') &&
        /Want to see these working/.test(document.getElementById('mSay')?.textContent ?? ''),
    )),
    'and she says it only once',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('LINK OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
