// Packages a prototype installs into prototypes/node_modules: the preview bundles them through their package.json
// (exports, module, main), a missing one is explained, and Myra installs one only after the person says yes, with no
// install scripts run.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-packages-')));
const repo = path.join(work, 'acme'),
  bin = path.join(work, 'bin'),
  modules = path.join(repo, 'prototypes', 'node_modules');
fs.mkdirSync(bin);
fs.mkdirSync(repo);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
const put = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(modules, rel)), { recursive: true });
  fs.writeFileSync(path.join(modules, rel), text);
};
// an ESM package with an exports map that imports a file of its own and a CommonJS package
put(
  'fake-chart/package.json',
  JSON.stringify({ name: 'fake-chart', exports: { '.': { import: './esm/index.js', require: './cjs.js' } } }),
);
put(
  'fake-chart/esm/index.js',
  "import { twice } from './util.js';\nimport pad from 'fake-pad';\nexport const chart = () => pad(String(twice(21)));\n",
);
put('fake-chart/esm/util.js', 'export const twice = n => n * 2;\n');
put('fake-pad/package.json', JSON.stringify({ name: 'fake-pad', main: 'lib.js' }));
put('fake-pad/lib.js', "module.exports = s => '[' + s + ']';\n");
fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho "$*" > ${work}/npm-args.txt\n`, { mode: 0o755 });

const l = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}` } });
const { page } = l;
const logText = () => page.evaluate(() => document.querySelector('.pv-log')?.textContent ?? '');
const problem = () => page.evaluate(() => document.querySelector('.pv-error')?.textContent ?? '');
// her question comes before her own reply, so all her words are read
const lastMyra = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].map(m => m.textContent ?? '').join(' | '));
// Under a full test run, Playwright sometimes reads this button as never settling though its box stays put (see
// decision 32), so it's pressed in the page
const press = (label: string) =>
  page.evaluate(
    label =>
      [...document.querySelectorAll<HTMLElement>('#mcList .m-acts button')]
        .filter(b => b.textContent === label)
        .at(-1)
        ?.click(),
    label,
  );
const until = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(200);
  }
  assert.fail(`${what}: ${await logText()} ${await problem()} ${await lastMyra()}`);
};

try {
  const dir = await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Chart', stack: 'react' });
    await window.Fenmyr.save({
      id: 'cb',
      name: 'Chart',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    return proto.dir;
  }, repo);
  const app = path.join(repo, dir, 'src/App.tsx');
  fs.writeFileSync(
    app,
    "import { chart } from 'fake-chart';\nconsole.log('chart ' + chart());\nexport const App = () => null;\n",
  );
  await page.evaluate(async () => {
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('cb');
  });
  await until(async () => /chart \[42\]/.test(await logText()), 'an installed package and its own imports bundle');

  fs.writeFileSync(app, "import thing from 'not-there';\nexport const App = () => <p>{String(thing)}</p>;\n");
  await page.click('[data-pv="refresh"]');
  await until(
    async () => /“not-there” isn't installed in this repo's prototypes folder/.test(await problem()),
    'a missing package is explained',
  );

  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'It needs d3.', install: { packages: ['d3'] } }, 'add a chart'),
  );
  await until(
    async () => /Install d3 into acme\/prototypes with npm install --ignore-scripts\?/.test(await lastMyra()),
    'Myra asks first',
  );
  await press('Install d3');
  await until(async () => /Installed d3/.test(await lastMyra()), 'and installs after a yes');
  const args = fs.readFileSync(path.join(work, 'npm-args.txt'), 'utf8').trim();
  assert.strictEqual(
    args,
    `install --prefix ${path.join(repo, 'prototypes')} --ignore-scripts --no-audit --no-fund --save d3`,
  );

  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Hm.', install: { packages: ['rm -rf'] } }, 'x'));
  await press('Install rm -rf');
  await until(
    async () => /isn't a package name npm accepts/.test(await lastMyra()),
    'a name npm wouldn’t accept is refused',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('PACKAGES OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
