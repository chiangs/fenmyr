// A project exported from its menu and opened again. It goes out with its folders (one inside another), every board in
// them, a board's canvas and its video, and comes back with its structure, names, colour and cover as they were and a new
// id for each. Its repo, its vault grants and a prototyping folder's kind are not in the zip, read from the zip itself,
// and a zip made by hand can't bring them in. Opened twice it is two projects, the second numbered, sharing nothing.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jsonBytes, openZip, packZip } from '../src/shared/fenmyrZip.ts';
import { launch } from './support/launch.ts';
import { look, stored } from './support/library.ts';
import { still } from './support/settled.ts';
import { asCopied, BOARDS, COVER, cardOf, FOLDERS, ofCopy, PROJECTS, seedAcme, VIDEO } from './support/zipAcme.ts';
import { dialogsAnswer, manifestFor, rec } from './support/zipKit.ts';
import { exportFrom, importFromHome, readBoards, saidSaved, webm } from './support/zipUi.ts';

const l = await launch({ boards: BOARDS, open: 'r1' });
const { page, app } = l;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-project-'));
const mediaDir = path.join(l.data, 'fenmyr', 'media');
fs.writeFileSync(path.join(mediaDir, VIDEO), await webm(page));
await seedAcme(page);
await page.evaluate(() => window.__fenmyr.openHome('all'));
await still(page);
const zipPath = path.join(out, 'Acme.fenmyr.zip');
const originals = new Set([...BOARDS, ...PROJECTS, ...FOLDERS].map(x => x.id));

// out: the dialog says what is going, and the zip holds it
await dialogsAnswer(app, zipPath, null);
const dialog = await exportFrom(page, page.locator('#boards .node.project .fname', { hasText: /^Acme$/ }));
assert.match(dialog.text, /Export “Acme”/, 'the dialog names the project');
assert.match(
  dialog.text,
  /1 project · 4 folders · 6 boards \(1 inside canvases\) · 1 video · about \d+ KB/,
  'it counts what goes, the way the issue shows it',
);
assert.deepStrictEqual(
  dialog.checked,
  { zxVideos: true, zxChats: false, zxVault: false },
  'videos are ticked, and chats and the text of vault notes are asked about and not ticked',
);
await dialog.ok();
await saidSaved(page, 'Acme');
const zip = openZip(new Uint8Array(fs.readFileSync(zipPath)), true);
assert.deepStrictEqual(
  [...zip.names].sort(),
  [
    'boards/r1.json',
    'boards/r2.json',
    'boards/r3.json',
    'boards/r4.json',
    'boards/r5.json',
    'boards/r6.json',
    'fenmyr.json',
    `media/${VIDEO}`,
  ],
  'the manifest, every board of every folder, and the one video',
);
const manifest = rec(JSON.parse(Buffer.from(zip.json['fenmyr.json'] ?? []).toString()));
assert.deepStrictEqual(manifest.root, { kind: 'project', id: 'p1' });
assert.deepStrictEqual(
  manifest.projects,
  [{ id: 'p1', name: 'Acme', color: 'mint', cover: COVER }],
  'the project goes with its name, colour and cover',
);
assert.deepStrictEqual(
  (Array.isArray(manifest.folders) ? manifest.folders : [])
    .map(rec)
    .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  [
    { id: 'f1', name: 'Plans', project: 'p1', parent: null },
    { id: 'f2', name: 'Drafts', project: 'p1', parent: 'f1' },
    { id: 'f3', name: 'Ideas', project: 'p1', parent: null },
    { id: 'f4', name: 'Protos', project: 'p1', parent: null },
  ],
  'its folders, each in the one it was in, the prototyping one as an ordinary folder',
);
assert.deepStrictEqual([...(Array.isArray(manifest.boards) ? manifest.boards : [])].sort(), [
  'r1',
  'r2',
  'r3',
  'r4',
  'r5',
  'r6',
]);
assert.deepStrictEqual(
  manifest.left,
  { videos: 0, chats: true, vaultText: 1, missingCanvases: 0 },
  'it says what was left out',
);
assert.deepStrictEqual(manifest.media, [VIDEO]);
// what never goes, read from the zip and not from what came back
const textOf = (names: string[]) => names.map(n => Buffer.from(zip.json[n] ?? []).toString()).join('\n');
const everything = textOf(Object.keys(zip.json));
for (const word of [
  '"repo"',
  '"vaults"',
  'prototyping',
  '/home/me',
  '"proto"',
  'CHAT-SECRET',
  'DRAFT-SECRET',
  'NOTE-SECRET',
  '"chatDraft"',
  '"vaultAccess"',
  '"vault"',
  '"path"',
])
  assert.ok(!everything.includes(word), `${word} is not in the zip`);
// the manifest says there were chats; the boards hold none
for (const word of ['"chat"', '"chats"'])
  assert.ok(
    !textOf(Object.keys(zip.json).filter(n => n.startsWith('boards/'))).includes(word),
    `${word} is in no board`,
  );

// in: from Home, as a new project
const onDisk = readBoards(l.data);
const projectsBefore = (await stored(page)).projects.length;
await importFromHome(app, page, zipPath, 'Acme 2');
await still(page);
assert.match(
  await page.locator('#mSay').innerText(),
  /^I added “Acme 2” with 4 folders and 6 boards ✦ The chats weren't in the zip\. The text of 1 vault note wasn't in the zip\.$/,
  'Myra says what came, and what did not',
);
const first = await stored(page);
assert.strictEqual(first.projects.length, projectsBefore + 1, 'one project came in');
const acme2 = first.projects.find(p => p.name === 'Acme 2');
assert.ok(acme2, 'numbered, because Acme was already here');
assert.deepStrictEqual(
  [acme2.color, acme2.cover, acme2.repo, acme2.vaults, acme2.open],
  ['mint', COVER, undefined, undefined, true],
  'with its colour and cover, and with no repo or vault grants',
);
assert.ok(!originals.has(acme2.id), 'under an id of its own');
const folders2 = first.folders.filter(f => f.project === acme2.id);
const folderNamed = (name: string) => folders2.find(f => f.name === name);
assert.deepStrictEqual(folders2.map(f => f.name).sort(), ['Drafts', 'Ideas', 'Plans', 'Protos'], 'its four folders');
assert.strictEqual(folderNamed('Drafts')?.parent, folderNamed('Plans')?.id, 'Drafts is still inside Plans');
assert.deepStrictEqual(
  folders2.filter(f => f.name !== 'Drafts').map(f => f.parent ?? null),
  [null, null, null],
  'and the others are at the top',
);
assert.deepStrictEqual(
  folders2.map(f => f.kind),
  [undefined, undefined, undefined, undefined],
  'the prototyping folder came as an ordinary one',
);
for (const f of folders2) assert.ok(!originals.has(f.id), `${f.name} has an id of its own`);

const added = readBoards(l.data).filter(b => !onDisk.some(o => o.id === b.id));
assert.strictEqual(added.length, 6, 'every board came in, the canvas too');
const copy = (name: string) => rec(added.find(b => b.name === name));
const [roadmap, detail] = [copy('Roadmap'), copy('Detail')];
const homes = Object.fromEntries(
  ['Roadmap', 'Detail', 'Sketch', 'Notes', 'Prototype', 'Secrets'].map(n => [n, copy(n).folder]),
);
assert.deepStrictEqual(
  homes,
  {
    Roadmap: folderNamed('Plans')?.id,
    Detail: folderNamed('Plans')?.id,
    Sketch: folderNamed('Drafts')?.id,
    Notes: folderNamed('Ideas')?.id,
    Prototype: folderNamed('Protos')?.id,
    Secrets: folderNamed('Ideas')?.id,
  },
  'each board is in the copy of the folder it was in',
);
assert.strictEqual(detail.parent, roadmap.id, 'the canvas is under the board that holds it');
assert.strictEqual(cardOf(roadmap, 'rc').board, detail.id, 'and the card points at the copy');
assert.strictEqual(roadmap.parent, undefined, 'a board of its own has no parent');
assert.deepStrictEqual(
  [copy('Prototype').kind, copy('Prototype').proto],
  [undefined, undefined],
  'a prototype is a board',
);
const secrets = copy('Secrets'),
  note = cardOf(secrets, 'vn');
assert.deepStrictEqual(
  [secrets.chat, secrets.chats, secrets.chatDraft, secrets.vaultAccess],
  [undefined, undefined, undefined, undefined],
  'no chats, draft or vault access came with a board',
);
assert.deepStrictEqual(
  [note.vault, note.path, note.excerpt, note.props, note.title, note.notIncluded, note.unlinked],
  [undefined, undefined, undefined, undefined, 'Note', true, true],
  'and a vault note keeps its name and says its link and text are not there',
);
const videoCopy = path.basename(String(cardOf(roadmap, 'rv').src));
assert.notStrictEqual(videoCopy, VIDEO, 'the video has a name of its own');
assert.ok(
  fs.readFileSync(path.join(mediaDir, videoCopy)).equals(fs.readFileSync(path.join(mediaDir, VIDEO))),
  'and is the same video',
);
const ids = Object.fromEntries(['r1', 'r2'].map((id, i) => [id, String([roadmap, detail][i]?.id)]));
for (const [id, name] of [
  ['r1', 'Roadmap'],
  ['r2', 'Detail'],
  ['r3', 'Sketch'],
  ['r4', 'Notes'],
  ['r5', 'Prototype'],
] as const)
  assert.deepStrictEqual(
    ofCopy(copy(name)),
    asCopied(rec(onDisk.find(b => b.id === id)), ids, videoCopy),
    `${name} came back as it went: its cards, tags, links, Unsorted and view`,
  );

// the project opens on Home, and its video plays
const open = await look(page);
assert.ok(open.home, 'Home is open');
assert.strictEqual(await page.locator('#homeTitle').innerText(), 'Acme 2', 'on the project that came in');
await page.evaluate(id => window.__fenmyr.openBoard(id), String(roadmap.id));
await page.waitForFunction(
  () => {
    const v = document.querySelector<HTMLVideoElement>('#cards [data-id="rv"] video');
    return !!v && (v.readyState >= 1 || !!v.error);
  },
  null,
  { timeout: 10_000 },
);
assert.strictEqual(
  await page.evaluate(() => document.querySelector<HTMLVideoElement>('#cards [data-id="rv"] video')?.videoWidth),
  64,
  'the imported video loads from its own file',
);

// twice: two projects, the second numbered, sharing nothing
await page.evaluate(() => window.__fenmyr.openHome('all'));
await still(page);
await importFromHome(app, page, zipPath, 'Acme 3');
await still(page);
const second = await stored(page);
assert.strictEqual(second.projects.length, projectsBefore + 2, 'a second copy came in beside the first');
const acme3 = second.projects.find(p => p.name === 'Acme 3');
assert.ok(acme3 && acme3.id !== acme2.id, 'with a number of its own');
const mine = (p: { id: string }) => second.folders.filter(f => f.project === p.id);
const everyId = [...second.projects, ...mine(acme2), ...mine(acme3), ...readBoards(l.data).map(b => rec(b))].map(x =>
  String(x.id),
);
assert.strictEqual(new Set(everyId).size, everyId.length, 'no id is shared between the three');
assert.strictEqual(mine(acme3).length, 4, 'with its own four folders');
assert.strictEqual(
  fs.readdirSync(mediaDir).filter(n => n.endsWith('.webm')).length,
  3,
  'and its own copy of the video',
);

// a zip made by hand can't bring a repo, vault grants or a prototyping kind in
const hand = packZip({
  'fenmyr.json': jsonBytes({
    ...manifestFor(['hb']),
    root: { kind: 'project', id: 'hp' },
    projects: [{ id: 'hp', name: 'Hand', color: 'sky', repo: { path: '/etc' }, vaults: [{ vault: 'v9' }] }],
    folders: [{ id: 'hf', name: 'Proto', project: 'hp', parent: null, kind: 'prototyping', repo: { path: '/etc' } }],
  }),
  'boards/hb.json': jsonBytes({
    id: 'hb',
    name: 'Handmade',
    folder: 'hf',
    kind: 'prototype',
    proto: { dir: '/etc', stack: 'html' },
    vaultAccess: [{ vault: 'v9', folders: [''], ai: true }],
    cards: [],
    links: [],
    tray: [],
  }),
});
const handPath = path.join(out, 'Hand.fenmyr.zip');
fs.writeFileSync(handPath, hand);
await page.evaluate(() => window.__fenmyr.openHome('all'));
await still(page);
await importFromHome(app, page, handPath, 'Hand');
await still(page);
const made = await stored(page);
const hp = made.projects.find(p => p.name === 'Hand');
const hf = made.folders.find(f => f.project === hp?.id);
const hb = readBoards(l.data).find(b => b.name === 'Handmade');
assert.ok(hp && hf && hb, 'it came in');
assert.deepStrictEqual(
  [hp.repo, hp.vaults, hf.kind, hb.kind, hb.proto, hb.vaultAccess, hb.folder === hf.id],
  [undefined, undefined, undefined, undefined, undefined, undefined, true],
  'with none of what a zip must not carry',
);

console.log('zipProject ok');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
