// Prototyping folders and new prototypes: a linked project gets a prototyping folder, its + makes a prototype board
// with its own code folder in the repo, names never clash, and the repo's own shared files are never overwritten.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-proto-')));
const repo = path.join(work, 'acme'),
  lionRepo = path.join(work, 'lion');
for (const r of [repo, lionRepo]) {
  fs.mkdirSync(r);
  execFileSync('git', ['-C', r, 'init', '-q', '-b', 'main']);
}
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), '# Our own design notes\n');

const l = await launch();
const { page } = l;
const library = () => JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'folders.json'), 'utf8'));
const boardFile = (id: string) =>
  JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', `${id}.json`), 'utf8'));
const menu = async (project: string, item: string) => {
  await page.evaluate(name => {
    const head = [...document.querySelectorAll('#boards .node.project .node-head')].find(h =>
      h.textContent?.includes(name),
    );
    head?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
  }, project);
  await page.click(`#rowMenu [data-m="${item}"]`);
  await page.waitForTimeout(500);
};
const newPrototype = async (name: string, stack: 'react' | 'html') => {
  // the folder's buttons show on hover
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('#boards .node.folder.proto .node-head [data-a="add"]')?.click(),
  );
  await page.fill('#npName', name);
  await page.click(`#npStack [data-v="${stack}"]`);
  await page.click('#npOk');
  await page.waitForTimeout(1200);
  return page.evaluate(() => window.__fenmyr.curBoard());
};

try {
  await page.evaluate(
    async ([repo, lionRepo]) => {
      await window.Fenmyr.saveFolders({
        projects: [
          { id: 'p1', name: 'Acme', open: true, repo: { path: repo } },
          { id: 'p2', name: 'Personal', open: true },
          { id: 'p3', name: 'Lioness', open: true, repo: { path: lionRepo } },
        ],
        folders: [
          { id: 'fa', name: 'Planning', project: 'p1' },
          { id: 'pl', name: 'Lion prototypes', project: 'p3', kind: 'prototyping' },
        ],
        order: {},
      });
      await window.Fenmyr.save({ id: 'plainboard', name: 'Research', folder: 'fa', cards: [], links: [], tray: [] });
      await window.__fenmyr.refreshBoards();
    },
    [repo, lionRepo],
  );

  await menu('Personal', 'protoFolder');
  assert.match(
    await page.evaluate(() => document.querySelector('.tdlg.rl h3')?.textContent ?? ''),
    /Repo for “Personal”/,
    'an unlinked project is asked to link a repo first',
  );
  assert.ok(
    !library().folders.some((f: { project: string }) => f.project === 'p2'),
    'and gets no prototyping folder yet',
  );
  await page.keyboard.press('Escape');

  await menu('Acme', 'protoFolder');
  const folder = library().folders.find(
    (f: { kind?: string; project: string }) => f.kind === 'prototyping' && f.project === 'p1',
  );
  assert.deepStrictEqual(
    { name: folder.name, project: folder.project, kind: folder.kind },
    {
      name: 'Prototypes',
      project: 'p1',
      kind: 'prototyping',
    },
  );

  const first = await newPrototype('Checkout {flow}', 'react');
  assert.ok(first?.kind === 'prototype', 'the new board is a prototype');
  assert.deepStrictEqual(first.proto, { dir: 'prototypes/checkout-flow', stack: 'react' });
  assert.strictEqual(first.folder, folder.id);
  assert.strictEqual(boardFile(first.id).kind, 'prototype', 'and is saved as one');
  const code = path.join(repo, 'prototypes/checkout-flow');
  for (const f of ['index.html', 'src/main.tsx', 'src/App.tsx', 'src/styles.css'])
    assert.ok(fs.existsSync(path.join(code, f)), `${f} is there`);
  assert.match(
    fs.readFileSync(path.join(code, 'src/App.tsx'), 'utf8'),
    /const title = "Checkout flow";/,
    'braces never reach JSX',
  );
  for (const f of ['package.json', 'tsconfig.json', '.gitignore', 'myra.md'])
    assert.ok(fs.existsSync(path.join(repo, 'prototypes', f)), `the shared ${f} is made in prototypes/`);
  assert.strictEqual(
    fs.readFileSync(path.join(repo, 'prototypes', 'design.md'), 'utf8'),
    '# Our own design notes\n',
    'the repo’s own design.md is kept',
  );
  assert.deepStrictEqual(fs.readdirSync(repo).sort(), ['.git', 'prototypes'], 'nothing lands at the repo root');
  assert.match(
    fs.readFileSync(path.join(repo, 'prototypes', 'myra.md'), 'utf8'),
    /The JSX return holds no logic/,
    'the default coding guidance is there to edit',
  );
  assert.ok(
    await page.evaluate(() => !!document.querySelector('#boards .board-row.proto.on')),
    'the sidebar marks it as a prototype',
  );

  const second = await newPrototype('Checkout flow', 'html');
  assert.deepStrictEqual(
    second?.proto,
    { dir: 'prototypes/checkout-flow-2', stack: 'html' },
    'a taken name gets a number',
  );
  for (const f of ['index.html', 'style.css', 'script.js'])
    assert.ok(fs.existsSync(path.join(repo, 'prototypes/checkout-flow-2', f)), `plain HTML has ${f}`);

  // Myra's latest words: in her chat on a prototype board, where it stays open, and in her bubble elsewhere
  const said = () =>
    page.evaluate(() =>
      document.body.classList.contains('proto')
        ? ([...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.textContent ?? '')
        : (document.getElementById('mBubble')?.textContent ?? ''),
    );
  await page.evaluate(id => window.__fenmyr.moveBoard(id, 'fa'), first.id);
  assert.match(
    await said(),
    /Prototype boards live in prototyping folders/,
    'a prototype can’t leave prototyping folders',
  );
  assert.strictEqual(boardFile(first.id).folder, folder.id, 'and stays put');
  await page.evaluate(() => window.__fenmyr.moveBoard('plainboard', 'pl'));
  assert.match(await said(), /hold only prototype boards/, 'a plain board can’t go into a prototyping folder');
  assert.strictEqual(boardFile('plainboard').folder, 'fa');

  await page.evaluate(id => window.__fenmyr.moveBoard(id, 'pl'), first.id);
  await page.waitForTimeout(800);
  assert.match(await said(), /Copied it to “Lioness”\. The original stays/);
  assert.strictEqual(boardFile(first.id).folder, folder.id, 'the original stays in Acme');
  const copies = fs
    .readdirSync(path.join(l.data, 'fenmyr', 'boards'))
    .map(f => JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', f), 'utf8')))
    .filter(b => b.folder === 'pl');
  assert.strictEqual(copies.length, 1, 'one copy lands in Lioness');
  const [copy] = copies;
  assert.deepStrictEqual(copy.proto, { dir: 'prototypes/checkout-flow', stack: 'react' });
  assert.ok(
    fs.existsSync(path.join(lionRepo, 'prototypes/checkout-flow/src/App.tsx')),
    'its code is copied into Lioness’s repo',
  );
  assert.deepStrictEqual(
    copy.chat.slice(-2).map((m: { who: string; text: string }) => [m.who, m.text.slice(0, 40)]),
    [
      ['myra', 'I copied “Checkout {flow}” from Acme int'],
      ['myra', 'Committing saves it in Lioness’s history'],
    ],
    'Myra says where it came from, in git’s terms and then in plain words',
  );
  assert.match(copy.chat.at(-2).text, /lion\/prototypes\/checkout-flow\. 4 new files, not committed yet\./);
  const untracked = execFileSync('git', ['-C', lionRepo, 'status', '--porcelain']).toString();
  assert.match(untracked, /\?\? prototypes\//, 'nothing is committed for them');

  await page.evaluate(id => window.__fenmyr.putFolder(id, null, 'p2'), folder.id);
  assert.match(await said(), /Link “Personal” to a repo first/, 'an unlinked project can’t take prototypes');
  assert.strictEqual(library().folders.find((f: { id: string }) => f.id === folder.id).project, 'p1');

  // Myra's own buttons, in her bubble or her chat
  const tap = async (label: string) => {
    const inChat = await page.evaluate(() => document.body.classList.contains('proto'));
    await page
      .locator(inChat ? '#mcList .m-acts button' : '#mActs button', { hasText: label })
      .last()
      .click();
  };
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
  git('add', '-A');
  git('commit', '-qm', 'two prototypes');
  await page.fill('#boardName', 'Landing page');
  await page.press('#boardName', 'Enter');
  await page.locator('#boardName').blur();
  await page.waitForTimeout(400);
  assert.match(await said(), /I can rename prototypes\/checkout-flow-2 to prototypes\/landing-page with git mv/);
  assert.match(await said(), /Your code keeps working either way/, 'the question comes in plain words too');
  await tap('Rename');
  await page.waitForTimeout(800);
  assert.strictEqual(boardFile(second.id).proto.dir, 'prototypes/landing-page', 'the board follows its folder');
  assert.match(
    git('status', '--porcelain'),
    /R {2}prototypes\/checkout-flow-2\/index\.html -> prototypes\/landing-page\/index\.html/,
    'git mv keeps the history',
  );

  fs.rmSync(path.join(repo, 'prototypes/checkout-flow'), { recursive: true });
  await page.evaluate(id => window.__fenmyr.openBoard(id), first.id);
  await page.waitForTimeout(800);
  assert.match(
    await said(),
    /I can't find prototypes\/checkout-flow in/,
    'a missing code folder is noticed on opening',
  );
  await tap('Bring it back');
  await page.waitForTimeout(800);
  assert.ok(
    fs.existsSync(path.join(repo, 'prototypes/checkout-flow/src/App.tsx')),
    'it comes back from the last commit',
  );
  assert.match(await said(), /back as it was at the last commit/);

  await page.evaluate(() =>
    window.__fenmyr.applyMyra(
      {
        say: 'Made it.',
        newPrototype: {
          name: 'Sign up',
          stack: 'react',
          purpose: 'Test a shorter sign-up',
          device: 'phone',
          project: 'Acme',
        },
      },
      'make a prototype',
    ),
  );
  await page.waitForTimeout(1200);
  const made = await page.evaluate(() => window.__fenmyr.curBoard());
  assert.ok(made?.kind === 'prototype', 'Myra’s new prototype opens');
  assert.deepStrictEqual(made.proto, {
    dir: 'prototypes/sign-up',
    stack: 'react',
    purpose: 'Test a shorter sign-up',
    device: 'phone',
  });
  assert.strictEqual(made.folder, folder.id, 'in the project’s prototyping folder');
  await page.evaluate(() =>
    window.__fenmyr.applyMyra(
      { say: 'Link it first.', newPrototype: { name: 'Diary', project: 'Personal' } },
      'make one',
    ),
  );
  await page.waitForTimeout(500);
  assert.ok(
    await page.locator('button:visible', { hasText: 'Link “Personal” to a repo' }).count(),
    'an unlinked project gets the link button instead',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('PROTOTYPE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
