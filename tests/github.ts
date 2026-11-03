// A linked project gets a GitHub repo from its Repo… dialog: made by the account picked (whose token never reaches the
// page or the library), or taken from the repo's existing GitHub origin.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-github-')));
const bin = path.join(work, 'bin'),
  acme = path.join(work, 'acme'),
  lion = path.join(work, 'lion'),
  calls = path.join(work, 'calls');
for (const d of [bin, acme, lion]) fs.mkdirSync(d);
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args]);
for (const d of [acme, lion]) {
  git(d, 'init', '-q', '-b', 'main');
  git(d, 'config', 'user.name', 'Ann Lee');
  git(d, 'config', 'user.email', 'ann@example.com');
}
git(lion, 'remote', 'add', 'origin', 'git@github.com:ann-lee/lion.git');
const accounts =
  '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"ann-lee"},{"state":"success","active":false,"host":"github.com","login":"ann-work"}]}}';
fs.writeFileSync(
  path.join(bin, 'gh'),
  `#!/bin/sh
case "$*" in
  "auth status --json hosts") echo '${accounts}' ;;
  "auth token --hostname github.com --user "*) echo "tok-$6" ;;
  "repo create "*)
    echo "$GH_TOKEN $*" >> ${calls}
    git -C "$6" remote add origin "https://github.com/ann-work/$3.git"
    echo "https://github.com/ann-work/$3" ;;
esac
`,
  { mode: 0o755 },
);

const l = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
const { page } = l;
const library = () => fs.readFileSync(path.join(l.data, 'fenmyr', 'folders.json'), 'utf8');
const screen = () => page.evaluate(() => document.querySelector('.rl-body')?.textContent ?? '');
// the dialog turns its buttons off while a step runs and draws the next screen when it's done
const press = async (action: string) => {
  await page.click(`.rl-body [data-a="${action}"]`);
  await page.waitForFunction(
    () => !document.querySelector('.rl-body') || !!document.querySelector('.rl-body button:not([disabled])'),
  );
};
const openRepo = async (name: string) => {
  await page.evaluate(name => {
    const head = [...document.querySelectorAll('#boards .node.project .node-head')].find(h =>
      h.textContent?.includes(name),
    );
    head?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    document.querySelector<HTMLElement>('#rowMenu [data-m="repo"]')?.click();
  }, name);
  await page.waitForTimeout(600);
};

try {
  await page.evaluate(
    async ([acme, lion]) => {
      await window.Fenmyr.saveFolders({
        projects: [
          { id: 'p1', name: 'Acme Checkout', open: true, repo: { path: acme } },
          { id: 'p2', name: 'Lioness', open: true, repo: { path: lion } },
        ],
        folders: [],
        order: {},
      });
      await window.__fenmyr.refreshBoards();
    },
    [acme, lion],
  );

  await openRepo('Acme Checkout');
  assert.match(await screen(), /Only on this computer/);
  await press('github');
  assert.match(await screen(), /GitHub account/);
  assert.strictEqual(await page.inputValue('#rlRepoName'), 'acme-checkout', 'the name comes from the project');
  assert.strictEqual(await page.inputValue('#rlAcct'), 'ann-lee', 'the account in use is picked first');
  assert.ok(await page.isChecked('#rlPrivate'), 'new repos are private unless unticked');
  await page.selectOption('#rlAcct', 'ann-work');
  await page.fill('#rlRepoName', 'bad name!');
  await press('createGitHub');
  assert.match(await screen(), /letters, numbers, dots, dashes and underscores/, 'a bad name is explained');
  assert.strictEqual(await page.inputValue('#rlAcct'), 'ann-work', 'the account picked is kept');
  await page.fill('#rlRepoName', 'acme-protos');
  await press('createGitHub');
  await page.waitForTimeout(500);
  assert.match(await screen(), /github\.com\/ann-work\/acme-protos · as ann-work/);
  assert.deepStrictEqual(JSON.parse(library()).projects[0].repo, {
    path: acme,
    github: { owner: 'ann-work', name: 'acme-protos', account: 'ann-work' },
  });
  assert.strictEqual(
    fs.readFileSync(calls, 'utf8').trim(),
    `tok-ann-work repo create acme-protos --private --source ${acme} --remote origin`,
    'gh made it as the account picked, privately, from the linked folder',
  );
  assert.strictEqual(
    git(acme, 'remote', 'get-url', 'origin').toString().trim(),
    'https://github.com/ann-work/acme-protos.git',
  );
  await press('done');

  await openRepo('Lioness');
  await press('github');
  assert.match(await screen(), /already has a copy on GitHub at github\.com\/ann-lee\/lion/);
  await press('useGitHub');
  assert.deepStrictEqual(JSON.parse(library()).projects[1].repo.github, {
    owner: 'ann-lee',
    name: 'lion',
    account: 'ann-lee',
  });
  assert.strictEqual(
    fs.readFileSync(calls, 'utf8').trim().split('\n').length,
    1,
    'using an existing copy makes nothing',
  );

  const seen = (await page.content()) + library();
  assert.ok(!seen.includes('tok-'), 'no token reaches the page or the library file');
  assert.deepStrictEqual(l.errors, []);
  console.log('GITHUB OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
