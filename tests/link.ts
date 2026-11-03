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
const press = async (action: string) => {
  await page.click(`.rl-body [data-a="${action}"]`);
  await page.waitForTimeout(300);
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
  assert.deepStrictEqual(l.errors, []);
  console.log('LINK OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
