// The ways to open a zip, each into the right place: Home's button, the folder menu and the project menu, a prototyping
// folder that takes only prototypes, and a zip dropped on the board, on Home and in the sidebar. A drop of anything
// but a zip is left alone.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonBytes, packZip } from '../src/shared/fenmyrZip.ts';
import { launch } from './support/launch.ts';
import { look, makes, SEEDED, seedLibrary, stored } from './support/library.ts';
import { still } from './support/settled.ts';
import { board, dialogsAnswer, manifestFor } from './support/zipKit.ts';
import { quiet, said } from './support/zipUi.ts';

const l = await launch({ boards: SEEDED, open: 'a' });
const { page, app } = l;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-ways-'));
const zip = path.join(out, 'Imported.fenmyr.zip');
fs.writeFileSync(
  zip,
  packZip({
    'fenmyr.json': jsonBytes(manifestFor(['z1'])),
    'boards/z1.json': jsonBytes({
      ...board('z1'),
      name: 'Imported',
      cards: [{ id: 'z', type: 'note', x: 0, y: 0, w: 220, h: 120, text: 'Zipped' }],
    }),
  }),
);
await seedLibrary(page, [{ id: 'f4', name: 'Prototypes', project: 'p2', kind: 'prototyping', open: true }]);
await dialogsAnswer(app, null, zip);
const added = (name = 'Imported') => said(page, `I added “${name}”`);
// the board that came, where it went, and what is open
const into = async (act: () => Promise<unknown>) => {
  await quiet(page);
  const made = await makes(page, 'board', async () => {
    await act();
    await added(expected);
  });
  return { folder: made.folder, name: made.name, open: await look(page) };
};
let expected = 'Imported';
const rightClick = (selector: string, name: RegExp) =>
  page.locator(selector, { hasText: name }).first().click({ button: 'right' });
const menu = async (selector: string, name: RegExp) => {
  await rightClick(selector, name);
  await page.locator('#rowMenu [data-m="zipIn"]').click();
};

// Home's button: on its own
await page.evaluate(() => window.__fenmyr.openHome('all'));
await still(page);
let got = await into(() => page.locator('#homeImport').click());
assert.deepStrictEqual(
  [got.folder, got.name, got.open.board, got.open.home],
  [null, 'Imported', 'Imported', false],
  'from All projects it lands on its own, and opens',
);

// a folder's menu: in that folder
expected = 'Imported';
got = await into(() => menu('#boards .node.folder .fname', /^Tools$/));
assert.strictEqual(got.folder, 'f3', 'a folder takes it');
assert.strictEqual(got.open.folder, 'f3', 'and it is open there');

// a project's menu: in its first folder, or on its own when it has none
got = await into(() => menu('#boards .node.project .fname', /^Garden$/));
assert.strictEqual(got.folder, 'f2', 'a project takes it into its first folder, as + Board would');
expected = 'Imported 2';
// in a project the left box shows only that project, so Home is where the others are
await page.evaluate(() => window.__fenmyr.openHome('all'));
await still(page);
got = await into(() => menu('#boards .node.project .fname', /^Empty$/));
assert.deepStrictEqual(
  [got.folder, got.name],
  [null, 'Imported 2'],
  'a project with no folder has nowhere to put it, so it lands on its own, numbered among those',
);

// a prototyping folder takes only prototypes
await quiet(page);
const before = (await stored(page)).boards.length;
await menu('#boards .node.folder .fname', /^Prototypes$/);
await said(page, 'Prototyping folders hold only prototype boards.');
assert.strictEqual((await stored(page)).boards.length, before, 'and nothing is made');

// the ways out: each opens the dialog for its board, and Cancel makes nothing
const asksFor = async (name: string) => {
  const dialog = page.locator('#zipExport');
  await dialog.waitFor();
  assert.match(await dialog.locator('h3').innerText(), new RegExp(`^Export “${name}”$`), `the dialog is for ${name}`);
  await dialog.locator('#zxNo').click();
  await dialog.waitFor({ state: 'detached' });
};
await page.evaluate(() => window.__fenmyr.openBoard('b'));
await still(page);
await page.mouse.click(900, 650, { button: 'right' });
await page.locator('#rowMenu button', { hasText: 'Export as zip…' }).click();
await asksFor('b');
await page.locator('#boards .board-row', { hasText: /^b$/ }).click({ button: 'right' });
await page.locator('#rowMenu [data-m="zipOut"]').click();
await asksFor('b');
await page.evaluate(() => window.__fenmyr.openHome('all'));
await still(page);
await page
  .locator('#home .tile.board', { hasText: /^loose/ })
  .first()
  .click({ button: 'right' });
assert.strictEqual(
  await page.locator('#rowMenu [data-m="zipIn"]').count(),
  0,
  'a board is exported, not imported into',
);
await page.locator('#rowMenu [data-m="zipOut"]').click();
await asksFor('loose');
await page.locator('#homeClose').click();

// a zip dropped
// a real file, as the page gets one from the system: its path is what the host opens
await page.evaluate(() => {
  const input = document.createElement('input');
  input.type = 'file';
  input.id = 'zzFile';
  document.body.append(input);
});
await page.setInputFiles('#zzFile', zip);
const drop = (target: string) =>
  page.evaluate(sel => {
    const input = document.getElementById('zzFile');
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    const el = document.querySelector(sel);
    if (!file || !el) throw new Error(`no file or ${sel}`);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const over = new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true });
    el.dispatchEvent(over);
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    return over.defaultPrevented;
  }, target);

// on a board: in the folder that board is in
await page.evaluate(() => window.__fenmyr.openBoard('b'));
await still(page);
expected = 'Imported 2';
let allowed = false;
got = await into(async () => {
  allowed = await drop('#cards');
});
assert.ok(allowed, 'a zip may be dropped on the board');
assert.deepStrictEqual([got.folder, got.name], ['f2', 'Imported 2'], 'a zip dropped on a board lands in its folder');

// on Home: in the folder Home is showing
await page.evaluate(() => window.__fenmyr.openHome('folder:f3'));
await still(page);
expected = 'Imported 2';
got = await into(async () => {
  allowed = await drop('#home');
});
assert.ok(allowed, 'and on Home');
assert.deepStrictEqual(
  [got.folder, got.name],
  ['f3', 'Imported 2'],
  'a zip dropped on Home lands in the folder it shows, numbered there',
);

// in the sidebar: where you are
await page.evaluate(() => window.__fenmyr.openBoard('a'));
await still(page);
expected = 'Imported';
got = await into(async () => {
  allowed = await drop('#boards');
});
assert.ok(allowed, 'and in the sidebar');
assert.strictEqual(got.folder, 'f1', 'a zip dropped in the sidebar lands where you are');

// anything else dropped is not taken: nothing says it may be dropped, and it is not opened as a zip
await page.evaluate(() => {
  const transfer = new DataTransfer();
  transfer.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
  const over = new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true });
  document.getElementById('boards')?.dispatchEvent(over);
  Reflect.set(window, 'zzAllowed', over.defaultPrevented);
});
assert.strictEqual(
  await page.evaluate(() => Reflect.get(window, 'zzAllowed')),
  false,
  'a text file is not welcome in the sidebar',
);

console.log('zipWaysIn ok');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
