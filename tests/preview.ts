// The preview: a React prototype bundled in the page and run in a frame that can run scripts and nothing else. It may
// not read Fenmyr's media, local files or the page around it; its errors and console lines come back; pointing at an
// element hands it to Myra; a package Fenmyr doesn't ship is explained.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-preview-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(repo);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
const app = `import { useState } from 'react';
import './extra.css';

const probe = async (what: string, go: () => Promise<unknown>) => {
  try { await go(); console.log(what + ':read'); } catch { console.log(what + ':blocked'); }
};

export function App() {
  const [n, setN] = useState(0);
  return <main><button className="count p-4" onClick={() => setN(n + 1)}>Count {n}</button></main>;
}
console.log('hello from the prototype');
probe('media', () => fetch('fenmyrmedia://media/x.webm').then(r => r.text()));
probe('file', () => fetch('file:///etc/hostname').then(r => r.text()));
probe('parent', async () => parent.document.body.innerHTML);
`;

const l = await launch();
const { page } = l;
const logText = () => page.evaluate(() => document.querySelector('.pv-log')?.textContent ?? '');
const until = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(200);
  }
  assert.fail(`${what}: ${await logText()}`);
};

try {
  const dir = await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const react = await window.Fenmyr.protoCreate({ root: repo, name: 'Counter', stack: 'react' });
    const plain = await window.Fenmyr.protoCreate({ root: repo, name: 'Landing', stack: 'html' });
    await window.Fenmyr.save({
      id: 'rb',
      name: 'Counter',
      folder: 'pf',
      kind: 'prototype',
      proto: react,
      cards: [],
      links: [],
      tray: [],
    });
    await window.Fenmyr.save({
      id: 'hb',
      name: 'Landing',
      folder: 'pf',
      kind: 'prototype',
      proto: plain,
      cards: [],
      links: [],
      tray: [],
    });
    return react.dir;
  }, repo);
  fs.writeFileSync(path.join(repo, dir, 'src/App.tsx'), app);
  fs.writeFileSync(path.join(repo, dir, 'src/extra.css'), '.count { color: rgb(1, 2, 3); }');
  fs.writeFileSync(path.join(repo, 'prototypes/landing/script.js'), "console.log('plain page ran')");

  await page.evaluate(async () => {
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('rb');
  });
  await until(async () => /hello from the prototype/.test(await logText()), 'the React prototype runs');
  const frame = page.frameLocator('#pr-preview iframe');
  assert.strictEqual(await frame.locator('button.count').textContent(), 'Count 0');
  assert.strictEqual(
    await frame.locator('button.count').evaluate(b => getComputedStyle(b).color),
    'rgb(1, 2, 3)',
    'imported CSS applies',
  );
  assert.strictEqual(
    await frame.locator('button.count').evaluate(b => getComputedStyle(b).paddingTop),
    '16px',
    'Tailwind classes apply, offline',
  );
  await frame.locator('button.count').click();
  assert.strictEqual(await frame.locator('button.count').textContent(), 'Count 1', 'React state works');
  assert.match(
    await frame.locator('body').evaluate(b => getComputedStyle(b).fontFamily),
    /sans-serif/,
    'the starter’s Tailwind stylesheet applies',
  );
  await until(
    async () => /parent:/.test(await logText()) && /media:/.test(await logText()) && /file:/.test(await logText()),
    'every probe reports',
  );
  const said = await logText();
  for (const what of ['media', 'file', 'parent'])
    assert.match(said, new RegExp(`${what}:blocked`), `the preview can’t read ${what}`);
  assert.ok(
    await page.evaluate(
      () => document.querySelector('#pr-preview iframe')?.getAttribute('sandbox') === 'allow-scripts',
    ),
    'scripts are all the frame may run',
  );

  await page.click('[data-pv="point"]');
  await frame.locator('button.count').click();
  await until(
    async () => /\[this: .*main > button\.count[^“]* “Count 1”\]/.test(await page.inputValue('#mcInput')),
    'pointing hands the element to Myra’s input',
  );

  await page.click('[data-dev="desktop"]');
  assert.match(
    await page.evaluate(() => document.querySelector('.pv-w')?.textContent ?? ''),
    /^1280 px · \d+%$/,
    'a desktop width scales to fit',
  );

  fs.writeFileSync(
    path.join(repo, dir, 'src/App.tsx'),
    "import _ from 'lodash';\n// TypeScript drops imports nothing uses, so this one is used\nexport const App = () => <p>{String(_)}</p>;\n",
  );
  await page.click('[data-pv="refresh"]');
  await until(
    async () =>
      /“lodash” isn't a package the preview has/.test(
        await page.evaluate(() => document.querySelector('.pv-error')?.textContent ?? ''),
      ),
    'a package Fenmyr doesn’t ship is explained',
  );

  await page.evaluate(() => window.__fenmyr.openBoard('hb'));
  await until(async () => /plain page ran/.test(await logText()), 'a plain HTML prototype runs its script');
  assert.deepStrictEqual(l.errors, []);
  console.log('PREVIEW OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
