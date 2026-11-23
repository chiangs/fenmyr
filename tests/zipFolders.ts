// A folder exported from its menu and placed again, into the right place and with its subfolders: into a project from the
// project's menu, into a folder from the folder's, or at the top of the current project from Home, and numbered when its
// name is taken. A prototyping folder takes none. A board zip made by the first version of the zip still opens as it did,
// and Duplicate, which walks a folder the same way, makes the copy it always did.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openZip } from '../src/shared/fenmyrZip.ts';
import { launch } from './support/launch.ts';
import { stored } from './support/library.ts';
import { still } from './support/settled.ts';
import { asCopied, BOARDS, cardOf, FOLDERS, ofCopy, seedAcme, VIDEO } from './support/zipAcme.ts';
import { dialogsAnswer, rec } from './support/zipKit.ts';
import { exportFrom, heard, quiet, readBoards, saidSaved, webm } from './support/zipUi.ts';

const l = await launch({ boards: BOARDS, open: 'r1' });
const { page, app } = l;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-folders-'));
const mediaDir = path.join(l.data, 'fenmyr', 'media');
fs.writeFileSync(path.join(mediaDir, VIDEO), await webm(page));
await seedAcme(page);
const home = async (go = 'all') => {
  await page.evaluate(g => window.__fenmyr.openHome(g), go);
  await still(page);
};
await home();
const row = (kind: 'project' | 'folder', name: string) =>
  page.locator(`#boards .node.${kind} .fname`, { hasText: new RegExp(`^${name}$`) }).first();

// out: the folder, the folder inside it, and the boards of both, and nothing that holds the folder
const zipPath = path.join(out, 'Plans.fenmyr.zip');
await dialogsAnswer(app, zipPath, null);
const dialog = await exportFrom(page, row('folder', 'Plans'));
assert.match(dialog.text, /Export “Plans”/);
assert.match(dialog.text, /2 folders · 3 boards \(1 inside canvases\) · 1 video · about \d+ KB/, 'what is going');
assert.ok(!/project/.test(await dialog.what()), 'no project goes with a folder');
await dialog.ok();
await saidSaved(page, 'Plans');
const zip = openZip(new Uint8Array(fs.readFileSync(zipPath)), true);
const manifest = rec(JSON.parse(Buffer.from(zip.json['fenmyr.json'] ?? []).toString()));
assert.deepStrictEqual(manifest.root, { kind: 'folder', id: 'f1' });
assert.deepStrictEqual(manifest.projects, [], 'a folder export has no projects');
assert.deepStrictEqual(
  manifest.folders,
  [
    { id: 'f1', name: 'Plans', project: null, parent: null },
    { id: 'f2', name: 'Drafts', project: null, parent: 'f1' },
  ],
  'the folder and its subfolder, with nothing that held them',
);
assert.deepStrictEqual([...(Array.isArray(manifest.boards) ? manifest.boards : [])].sort(), ['r1', 'r2', 'r3']);

// Duplicate walks a folder the way the export and the import do, and still copies what it always did
await quiet(page);
await row('project', 'Acme').click({ button: 'right' });
await page.locator('#rowMenu [data-m="dup"]').click();
assert.strictEqual(await heard(page), 'Made “Acme copy” ✦', 'Myra says what she made');
await still(page);
const dup = await stored(page);
const acmeCopy = dup.projects.find(p => p.name === 'Acme copy');
assert.deepStrictEqual([acmeCopy?.color, acmeCopy?.repo, acmeCopy?.vaults], ['mint', undefined, undefined]);
const inCopy = dup.folders.filter(f => f.project === acmeCopy?.id);
assert.deepStrictEqual(inCopy.map(f => f.name).sort(), ['Drafts', 'Ideas', 'Plans', 'Protos'], 'every folder');
assert.strictEqual(
  inCopy.find(f => f.name === 'Drafts')?.parent,
  inCopy.find(f => f.name === 'Plans')?.id,
  'the one inside another still is',
);
const dupBoards = readBoards(l.data).filter(b => inCopy.some(f => f.id === b.folder));
assert.deepStrictEqual(
  dupBoards.map(b => b.name).sort(),
  ['Detail', 'Notes', 'Prototype', 'Roadmap', 'Secrets', 'Sketch'],
  'every board, the canvas too',
);

// out, from Home: a project's tile and a folder's tile have the entry too, and Cancel makes nothing
const asks = async (tile: string, name: string) => {
  await quiet(page);
  await page
    .locator(`${tile} .tile-meta b`, { hasText: new RegExp(`^${name}$`) })
    .first()
    .click({ button: 'right' });
  await page.locator('#rowMenu [data-m="zipOut"]').click();
  const ask = page.locator('#zipExport');
  await ask.waitFor();
  assert.match(await ask.locator('h3').innerText(), new RegExp(`^Export “${name}”$`), `Home's tile exports ${name}`);
  await ask.locator('#zxNo').click();
  await ask.waitFor({ state: 'detached' });
};
await asks('#home .tile.project', 'Garden');
await home('project:p1');
await asks('#home .tile.folder', 'Ideas');
await home();

// in: each way puts it where + Folder would
const onDisk = readBoards(l.data);
const landed = async (act: () => Promise<unknown>, name: string, words: string) => {
  await quiet(page);
  const before = new Set((await stored(page)).folders.map(f => f.id));
  await dialogsAnswer(app, null, zipPath);
  await act();
  const said = await heard(page);
  assert.match(said, new RegExp(`^I added “${name}” ${words}`), `Myra says what came as ${name}`);
  await still(page);
  const now = await stored(page),
    fresh = now.folders.filter(f => !before.has(f.id));
  return { fresh, now, top: fresh.find(f => !fresh.some(x => x.id === f.parent)) };
};
const menuIn = async (kind: 'project' | 'folder', name: string) => {
  await row(kind, name).click({ button: 'right' });
  await page.locator('#rowMenu [data-m="zipIn"]').click();
};

// a project's menu: at the top of that project, with its subfolder inside
let got = await landed(() => menuIn('project', 'Garden'), 'Plans', 'with 1 folder and 3 boards ✦');
assert.deepStrictEqual(
  [got.top?.name, got.top?.project, got.top?.parent],
  ['Plans', 'p2', undefined],
  'a project takes it at its top, under its own name',
);
const drafts = got.fresh.find(f => f.name === 'Drafts');
assert.deepStrictEqual([drafts?.parent, drafts?.project], [got.top?.id, 'p2'], 'with its subfolder inside it');
assert.ok(
  got.fresh.every(f => !FOLDERS.some(o => o.id === f.id) && f.kind === undefined),
  'under ids of their own',
);
const added = readBoards(l.data).filter(b => !onDisk.some(o => o.id === b.id));
const copy = (name: string) => rec(added.find(b => b.name === name));
assert.deepStrictEqual(
  [copy('Roadmap').folder, copy('Detail').folder, copy('Sketch').folder],
  [got.top?.id, got.top?.id, drafts?.id],
  'its boards are in the copies of their folders',
);
assert.strictEqual(copy('Detail').parent, copy('Roadmap').id, 'the canvas under the board that holds it');
assert.strictEqual(cardOf(copy('Roadmap'), 'rc').board, copy('Detail').id, 'and its card pointing at it');
const videoCopy = path.basename(String(cardOf(copy('Roadmap'), 'rv').src));
for (const [id, name] of [
  ['r1', 'Roadmap'],
  ['r2', 'Detail'],
  ['r3', 'Sketch'],
] as const)
  assert.deepStrictEqual(
    ofCopy(copy(name)),
    asCopied(rec(onDisk.find(b => b.id === id)), { r2: String(copy('Detail').id) }, videoCopy),
    `${name} came back as it went`,
  );

// a second time, into the same project: the name is taken, so it is numbered, and nothing is shared
const again = await landed(() => menuIn('project', 'Garden'), 'Plans 2', 'with 1 folder and 3 boards');
assert.strictEqual(again.top?.name, 'Plans 2', 'numbered');
assert.deepStrictEqual(
  again.fresh.filter(f => f.name === 'Drafts').length,
  1,
  'its subfolder keeps its name: only the one that lands here is numbered',
);
assert.ok(
  again.fresh.every(f => !got.fresh.some(x => x.id === f.id)),
  'no id is shared with the first copy',
);

// a folder's menu: inside that folder, and in its project
got = await landed(() => menuIn('folder', 'Beds'), 'Plans', 'with 1 folder and 3 boards');
assert.deepStrictEqual(
  [got.top?.parent, got.top?.project],
  ['f5', 'p2'],
  'a folder takes it inside itself, in the project it is in',
);

// Home: at the top of the project it shows, whatever folder that is
await home('project:p1');
got = await landed(() => page.locator('#homeImport').click(), 'Plans 2', 'with 1 folder and 3 boards');
assert.deepStrictEqual(
  [got.top?.name, got.top?.project, got.top?.parent],
  ['Plans 2', 'p1', undefined],
  'Home at a project puts it at the top, numbered against that project',
);
await home('folder:f5');
got = await landed(() => page.locator('#homeImport').click(), 'Plans 3', 'with 1 folder and 3 boards');
assert.deepStrictEqual(
  [got.top?.project, got.top?.parent],
  ['p2', undefined],
  'Home at a folder puts it at the top of its project, not inside the folder',
);
assert.strictEqual(
  (await page.locator('#homeTitle').innerText()).trim(),
  'Plans 3',
  'and the folder that came in is what Home opens on',
);

// a prototyping folder takes none, and nothing is made
await home();
await quiet(page);
const count = async () => (await stored(page)).folders.length;
const was = await count();
await dialogsAnswer(app, null, zipPath);
await menuIn('folder', 'Protos');
assert.strictEqual(await heard(page), 'Prototyping folders hold only prototype boards.', 'Myra says why');
assert.strictEqual(await count(), was, 'no folder was made');

// a board zip made by the first version of the zip still opens as it did
const fixture = path.join(import.meta.dirname, 'fixtures', 'pr1-board.fenmyr.zip');
const old = openZip(new Uint8Array(fs.readFileSync(fixture)), true);
const oldManifest = rec(JSON.parse(Buffer.from(old.json['fenmyr.json'] ?? []).toString()));
assert.deepStrictEqual(
  [oldManifest.format, oldManifest.root, oldManifest.projects, oldManifest.folders],
  [1, { kind: 'board', id: 'r1' }, [], []],
  'the fixture is a board zip, in the format as it was',
);
await quiet(page);
const boardsBefore = readBoards(l.data).map(b => b.id);
await dialogsAnswer(app, null, fixture);
await page.locator('#homeImport').click();
assert.match(await heard(page), /^I added “Roadmap” with 1 board inside it ✦/, 'Myra says what came');
await still(page);
const fresh = readBoards(l.data).filter(b => !boardsBefore.includes(b.id));
const root = rec(fresh.find(b => b.name === 'Roadmap')),
  kid = rec(fresh.find(b => b.name === 'Plans'));
assert.strictEqual(fresh.length, 2, 'the board and its canvas');
assert.deepStrictEqual([root.folder ?? null, root.parent, kid.parent], [null, undefined, root.id], 'placed as before');
assert.strictEqual(cardOf(root, 'c1').board, kid.id, 'its canvas card pointing at the copy');
assert.deepStrictEqual(
  [cardOf(root, 'n1').text, cardOf(root, 'n1').color, cardOf(root, 'lk').url, cardOf(kid, 'p1').text],
  ['First note', 'butter', 'https://example.com', 'A plan'],
  'with its cards',
);
const oldVideo = fs.readFileSync(path.join(mediaDir, path.basename(String(cardOf(root, 'vd').src))));
assert.ok(oldVideo.equals(Buffer.from(old.media['3c1d9a52-1111-4222-8333-444455556666.mp4'] ?? [])), 'and its video');

console.log('zipFolders ok');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
