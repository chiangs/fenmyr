// The git bar on a prototype board: in Myra's chat between the thread and the input, on two lines that fit her
// narrowest chat, with Commit on the bar and the repo, Push, Pull and GitHub in its More menu.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-dock-git-');
const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-C', cwd, ...a]).toString();
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'People miss the promo field' };
const l = await launch({ boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }], open: 'plain' });
const { page } = l;
const lastMyra = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].pop()?.textContent ?? '');
const until = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(200);
  }
  assert.fail(`${what}: ${await lastMyra()}`);
};
const bar = () =>
  page.evaluate(() => {
    const g = document.getElementById('prGit'),
      box = (el: Element | null | undefined) => el?.getBoundingClientRect() ?? null,
      inChat = !!g?.closest('#mChat');
    const branch = g?.querySelector('.pg-branch')?.textContent ?? '',
      state = g?.querySelector('.pg-state')?.textContent ?? '';
    return {
      shown: !!g?.checkVisibility(),
      inChat,
      branch,
      state,
      bar: box(g),
      list: box(document.getElementById('mcList')),
      grip: box(document.querySelector('#mChat .mc-grip')),
      form: box(document.getElementById('mcForm')),
      chat: box(document.getElementById('prChat')),
      branchBox: box(g?.querySelector('.pg-branch')),
      stateBox: box(g?.querySelector('.pg-state')),
      commit: box(g?.querySelector('[data-git="commit"]')),
      more: box(g?.querySelector('[data-git="more"]')),
      fits: !!g && g.scrollWidth === g.clientWidth,
      colour: g ? getComputedStyle(g).backgroundColor : '',
    };
  });
// More's heading in brackets, then its buttons
const more = async () => {
  await page.click('#prGit [data-git="more"]');
  await page.waitForSelector('#rowMenu');
  return page.evaluate(() =>
    [...document.querySelectorAll('#rowMenu .pg-where b, #rowMenu button')].map(b =>
      b.matches('b') ? `[${b.textContent}]` : (b.textContent ?? ''),
    ),
  );
};
const reread = async (state: string) => {
  await page.evaluate(() => dispatchEvent(new Event('focus')));
  await until(async () => (await bar()).state.endsWith(state), `the bar reads the repo again: ${state}`);
};
const pick = (label: string) => page.locator('#rowMenu button', { hasText: label }).click();

try {
  git(repo, 'config', 'user.name', 'Ann');
  git(repo, 'config', 'user.email', 'ann@example.com');
  await openPrototype(page, repo);
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await until(async () => (await bar()).branch === 'main', 'the bar reads the repo');

  let b = await bar();
  assert.ok(b.inChat && b.shown, 'the git bar is in Myra’s chat');
  assert.ok(
    b.bar && b.list && b.grip && b.form && b.list.bottom <= b.bar.top && b.bar.bottom <= b.grip.top,
    'under the thread and over the input’s height grip',
  );
  assert.ok(b.grip && b.form && b.grip.bottom <= b.form.top, 'which stays next to the input it resizes');
  assert.match(b.state, /^\d+ files not committed · No commits yet$/, 'line two: what isn’t committed, then GitHub');
  const { branchBox: br, stateBox: st, commit: cm } = b;
  assert.ok(
    br && st && cm && br.top + br.height / 2 > cm.top && br.top + br.height / 2 < cm.bottom && st.top >= cm.bottom - 1,
    'the branch and Commit share line one, and line two sits under them',
  );
  assert.strictEqual(b.colour, 'rgba(0, 0, 0, 0)', 'the chat’s own colour shows through the bar');

  const divider = await page.locator('.pr-div[data-d="chat"]').boundingBox();
  assert.ok(divider, 'the chat’s divider is up');
  await page.mouse.move(divider.x + 3, divider.y + 200);
  await page.mouse.down();
  await page.mouse.move(divider.x + 200, divider.y + 200, { steps: 4 });
  await page.mouse.up();
  b = await bar();
  assert.strictEqual(Math.round(b.chat?.width ?? 0), 280, 'the chat dragged to its narrowest');
  assert.ok(
    b.fits && b.bar && b.commit && b.more && b.commit.left >= b.bar.left && b.more.right <= b.bar.right,
    'at 280 px nothing spills, and Commit and More are whole',
  );

  await page.click('#prGit [data-git="commit"]');
  await until(
    async () => /Commit \d+ changed files in acme\/prototypes\/.+ to main\?/.test(await lastMyra()),
    'Commit asks first, as it did',
  );
  await page.locator('#mcList .m-acts button', { hasText: 'Commit' }).last().click();
  await until(async () => /Committed\./.test(await lastMyra()), 'and commits');
  await until(async () => (await bar()).state.startsWith('Everything committed'), 'then the bar says so');

  assert.deepStrictEqual(await more(), ['[acme]'], 'More names the repo, with no Push while it isn’t on GitHub');
  assert.match(
    await page.locator('#rowMenu').ariaSnapshot(),
    /^- menu "acme \/.+\/acme"$/,
    'a screen reader hears a menu named for the repo',
  );
  assert.match(
    await page.evaluate(() => document.querySelector('#rowMenu .pg-where small')?.textContent ?? ''),
    /\/acme$/,
    'with its path under its name',
  );
  const menu = await page.locator('#rowMenu').boundingBox(),
    btn = await page.locator('#prGit [data-git="more"]').boundingBox();
  assert.ok(
    menu &&
      btn &&
      menu.y + menu.height <= btn.y &&
      btn.y - (menu.y + menu.height) <= 10 &&
      Math.abs(menu.x + menu.width - (btn.x + btn.width)) <= 1,
    'it opens over the thread, ending just above its button, flush with its right edge',
  );

  const github = path.join(work, 'github.git'),
    other = path.join(work, 'other');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', github]);
  git(repo, 'remote', 'add', 'origin', github);
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  await reread('GitHub has every commit');
  assert.deepStrictEqual(await more(), ['[acme]', 'Push main to GitHub'], 'with a remote, Push is back');
  await pick('Push main to GitHub');
  await until(
    async () => /Push main of acme to .*github\.git\?/.test(await lastMyra()),
    'Push through More asks first',
  );

  execFileSync('git', ['clone', '-q', github, other]);
  fs.writeFileSync(path.join(other, 'NOTES.md'), 'from the teammate\n');
  git(other, 'add', 'NOTES.md');
  git(other, '-c', 'user.name=T', '-c', 'user.email=t@x', 'commit', '-qm', 'Notes');
  git(other, 'push', '-q');
  git(repo, 'fetch', '-q');
  await page.evaluate(() => window.__fenmyr.openBoard('pb'));
  await until(async () => (await bar()).state.endsWith('1 to pull'), 'line two says what’s waiting on GitHub');
  assert.deepStrictEqual(
    await more(),
    ['[acme]', 'Push main to GitHub', 'Pull 1 from GitHub'],
    'and More offers to pull it',
  );
  await pick('Pull 1 from GitHub');
  await until(async () => fs.existsSync(path.join(repo, 'NOTES.md')), 'Pull through More brings it in');

  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [
        {
          id: 'p1',
          name: 'Acme',
          open: true,
          repo: { path: repo, github: { owner: 'ann', name: 'acme', account: 'ann' } },
        },
      ],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  await page.waitForTimeout(600);
  assert.deepStrictEqual(
    (await more()).at(-1),
    'Open ann/acme on GitHub',
    'a repo on GitHub gets a way to its page, named as GitHub names it',
  );
  await page.click('#mcInput');
  await page.fill('#mcInput', 'a long request');
  await page.click('#mcExpand');
  assert.ok(!(await bar()).shown, 'the bar steps aside while the input is expanded');
  await page.click('#mcExpand');
  assert.ok((await bar()).shown, 'and comes back with the thread');

  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForTimeout(400);
  await page.click('#mPill');
  await page.waitForTimeout(400);
  b = await bar();
  assert.ok(b.inChat && !b.shown, 'an ordinary board’s chat has no git bar');

  assert.deepStrictEqual(l.errors, []);
  console.log('DOCK GIT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
