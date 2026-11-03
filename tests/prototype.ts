// Prototyping folders and new prototypes: a linked project gets a prototyping folder, its + makes a prototype board
// with its own code folder in the repo, names never clash, and the repo's own shared files are never overwritten.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-proto-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(repo);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
fs.writeFileSync(path.join(repo, 'design.md'), '# Our own design notes\n');

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
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [
        { id: 'p1', name: 'Acme', open: true, repo: { path: repo } },
        { id: 'p2', name: 'Personal', open: true },
      ],
      folders: [],
      order: {},
    });
    await window.__fenmyr.refreshBoards();
  }, repo);

  await menu('Personal', 'protoFolder');
  assert.match(
    await page.evaluate(() => document.querySelector('.tdlg.rl h3')?.textContent ?? ''),
    /Repo for “Personal”/,
    'an unlinked project is asked to link a repo first',
  );
  assert.deepStrictEqual(library().folders, [], 'and gets no prototyping folder yet');
  await page.keyboard.press('Escape');

  await menu('Acme', 'protoFolder');
  const [folder] = library().folders;
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
    /<h1>Checkout flow<\/h1>/,
    'braces never reach JSX',
  );
  for (const f of ['package.json', 'tsconfig.json', '.gitignore', 'myra.md'])
    assert.ok(fs.existsSync(path.join(repo, f)), `the shared ${f} is made`);
  assert.strictEqual(
    fs.readFileSync(path.join(repo, 'design.md'), 'utf8'),
    '# Our own design notes\n',
    'the repo’s own design.md is kept',
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
  assert.deepStrictEqual(l.errors, []);
  console.log('PROTOTYPE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
