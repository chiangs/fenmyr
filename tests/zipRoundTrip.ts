// A board exported from its menu and opened again. Everything it holds comes back but the ids and the video's name: notes,
// links, Unsorted, tags, a palette, a background, a picture, a voice memo and a video, and the video plays. A doc that is
// a prototype's own rules or design keeps its role and Ignore switch. Two levels of canvases come back remapped and open;
// one used twice is in the zip once; one whose board is gone keeps its card and is counted. A video bundled with the app
// stays a reference. Opened twice, it is two boards and two videos, and a video is not swept away after.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openZip } from '../src/shared/fenmyrZip.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { card, dialogsAnswer, rec } from './support/zipKit.ts';
import { exportRow, importFromHome, readBoards, saidSaved, webm } from './support/zipUi.ts';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const MEMO =
  'data:audio/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQUAGd2hhbW15RIlACECPQAAAAAAAFlSua0AxrkAu14EBY8WBAZyBACK1nEADdW5khkAFVl9WUDglhohAA1ZQOIOBAeBABrCBCLqBCB9DtnVAIueBAKNAHIEAAIAwAQCdASoIAAgAAUAmJaQAA3AA/vz0AAA=';
const video = `3c1d9a52-1111-4222-8333-444455556666.webm`;
const mk = (id: string, name: string, more: Record<string, unknown>) => ({
  id,
  name,
  color: 'mint',
  cards: [],
  links: [],
  tray: [],
  ...more,
});
const roadmap = mk('r1', 'Roadmap', {
  tags: ['q4'],
  palette: [{ hex: '#ff0000', name: 'Red' }],
  bg: 'dots',
  view: { x: 200, y: 150, z: 1 },
  cards: [
    card('n1', 'note', { text: 'First note', color: 'butter', tags: ['a'], due: '2030-01-01' }),
    card('lk', 'link', { url: 'https://example.com', title: 'Example' }),
    card('im', 'image', { src: PNG }),
    card('au', 'audio', { src: MEMO, dur: 3, ready: true, title: 'Memo' }),
    card('vd', 'video', { src: `fenmyrmedia://media/${video}`, title: 'Clip', dur: 1, vw: 64, vh: 48, poster: PNG }),
    card('bu', 'video', { src: 'beta/welcome.mp4', title: 'Welcome' }),
    card('c1', 'canvas', { text: 'Plans', board: 'r2' }),
    card('c2', 'canvas', { text: 'Plans', board: 'r2' }),
    card('c3', 'canvas', { text: 'Lost', board: 'nowhere' }),
    card('g1', 'doc', { text: 'Rules', body: 'Never use gradients.', role: 'rules', ignoreRepo: true }),
    card('g2', 'doc', { text: 'Design', body: 'Square corners.', role: 'design' }),
  ],
  links: [{ id: 'l1', a: 'n1', b: 'lk' }],
  tray: [card('tn', 'note', { text: 'In Unsorted' }), card('tc', 'canvas', { text: 'Deep', board: 'r3' })],
  trayLinks: [{ id: 't1', a: 'tn', b: 'tn' }],
});
const plans = mk('r2', 'Plans', {
  parent: 'r1',
  cards: [card('p1', 'note', { text: 'A plan' }), card('p2', 'canvas', { text: 'Deep', board: 'r3' })],
});
const deep = mk('r3', 'Deep', {
  parent: 'r2',
  cards: [card('d1', 'note', { text: 'Down here' })],
  kind: 'prototype',
  proto: { dir: 'prototypes/deep', stack: 'html' },
});

const l = await launch({ boards: [roadmap, plans, deep], open: 'r1' });
const { page, app } = l;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-round-'));
const mediaDir = path.join(l.data, 'fenmyr', 'media');
fs.writeFileSync(path.join(mediaDir, video), await webm(page));
const zipPath = path.join(out, 'Roadmap.fenmyr.zip');
const originals = new Set(['r1', 'r2', 'r3']);

// out: the dialog says what is going, and the zip holds it
await dialogsAnswer(app, zipPath, null);
const dialog = await exportRow(page, 'Roadmap');
assert.match(dialog.text, /Export “Roadmap”/, 'the dialog names the board');
assert.match(dialog.text, /3 boards \(2 inside canvases\)/, 'it counts the boards and the canvases inside');
assert.match(dialog.text, /1 picture/);
assert.match(dialog.text, /1 voice memo/);
assert.match(dialog.text, /2 videos|1 video/, 'and the videos');
assert.match(dialog.text, /about \d+ KB/, 'and says how big it is');
assert.match(dialog.text, /Include videos \(\d+ KB\)/, 'a tick for the videos, on');
assert.ok(!/chats with Myra|text of vault notes/.test(dialog.text), 'there are no chats or vault notes to ask about');
assert.match(dialog.text, /Vault links, repo links and a prototype’s code stay on this computer\./);
assert.strictEqual(dialog.checked.zxVideos, true, 'videos are on to start with');
await dialog.ok();
await saidSaved(page, 'Roadmap');
const zip = openZip(new Uint8Array(fs.readFileSync(zipPath)), true);
assert.deepStrictEqual(
  [...zip.names].sort(),
  ['boards/r1.json', 'boards/r2.json', 'boards/r3.json', 'fenmyr.json', `media/${video}`],
  'three boards, one of them used twice, the manifest and the one video: nothing bundled with the app',
);
const manifest = rec(JSON.parse(Buffer.from(zip.json['fenmyr.json'] ?? []).toString()));
assert.deepStrictEqual(manifest.root, { kind: 'board', id: 'r1' });
assert.deepStrictEqual([manifest.projects, manifest.folders], [[], []], 'a board export has no projects or folders');
assert.deepStrictEqual(manifest.media, [video]);
assert.deepStrictEqual(manifest.boards, ['r1', 'r2', 'r3'], 'each board is listed once, the one used twice too');
assert.deepStrictEqual(manifest.left, { videos: 0, chats: false, vaultText: 0, missingCanvases: 1 });
assert.deepStrictEqual(
  [manifest.app, manifest.commit, manifest.changes],
  [
    JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8')).version,
    '0123456789abcdef0123456789abcdef01234567',
    false,
  ],
  'the manifest says what made it',
);
const inZip = rec(JSON.parse(Buffer.from(zip.json['boards/r1.json'] ?? []).toString()));
assert.ok(
  Array.isArray(inZip.cards) && inZip.cards.some(c => rec(c).id === 'c3'),
  'a canvas whose board is gone keeps its card',
);
assert.deepStrictEqual(
  (Array.isArray(inZip.cards) ? inZip.cards : [])
    .map(rec)
    .filter(c => c.type === 'doc')
    .map(c => [c.id, c.role, c.ignoreRepo]),
  [
    ['g1', 'rules', true],
    ['g2', 'design', undefined],
  ],
  'a doc keeps its role and Ignore switch in the zip',
);
assert.ok(zip.media[video]?.length, 'the video is in the zip');
assert.strictEqual(
  rec(JSON.parse(Buffer.from(zip.json['boards/r3.json'] ?? []).toString())).proto,
  undefined,
  'a prototype goes as an ordinary board',
);

// in: from Home, as a new copy
const exported = readBoards(l.data);
await importFromHome(app, page, zipPath, 'Roadmap 2');
await still(page);
const after = readBoards(l.data).filter(b => !originals.has(String(b.id)));
assert.strictEqual(after.length, 3, 'the board and its two canvases came in');
const [root, kid, deeper] = ['Roadmap 2', 'Plans', 'Deep'].map(name => after.find(b => b.name === name));
assert.ok(root && kid && deeper, 'under their own names, but the one that was already here is numbered');
for (const b of after)
  for (const o of originals) assert.notStrictEqual(b.id, o, 'no id is shared with the board it was made from');
const canvasIds = (b: Record<string, unknown>) =>
  (Array.isArray(b.cards) ? b.cards : [])
    .map(rec)
    .filter(c => c.type === 'canvas')
    .map(c => [c.id, c.board]);
assert.deepStrictEqual(
  canvasIds(root),
  [
    ['c1', kid.id],
    ['c2', kid.id],
    ['c3', undefined],
  ],
  'both cards point at the same canvas, and the lost one has no board',
);
assert.deepStrictEqual(canvasIds(kid), [['p2', deeper.id]], 'a canvas inside a canvas');
assert.deepStrictEqual(
  (Array.isArray(root.cards) ? root.cards : [])
    .map(rec)
    .filter(c => c.type === 'doc')
    .map(c => [c.id, c.body, c.role, c.ignoreRepo]),
  [
    ['g1', 'Never use gradients.', 'rules', true],
    ['g2', 'Square corners.', 'design', undefined],
  ],
  'a prototype’s own rules and design come in with their role, and the Ignore switch where it was on',
);
assert.deepStrictEqual([kid.parent, deeper.parent], [root.id, kid.id], 'each is under the board that holds it');
assert.strictEqual(root.parent, undefined, 'the board is a board of its own');
assert.strictEqual(deeper.kind, undefined, 'a prototype came in as an ordinary board');
assert.deepStrictEqual(
  (Array.isArray(root.tray) ? root.tray : []).map(c => rec(c).board ?? rec(c).text),
  ['In Unsorted', deeper.id],
  'Unsorted came with its canvas card, remapped',
);

// every field is as it was, but the ids, the place, the video's name and what leads nowhere: compared with the files
// the exported boards were, as the app had saved them
const copyOfVideo = path.basename(
  String(rec((Array.isArray(root.cards) ? root.cards : []).map(rec).find(c => c.id === 'vd')).src),
);
const normal = (b: Record<string, unknown>, ids: Record<string, string>) => {
  const { id, name, folder, parent, view, kind, proto, chat, chats, ...rest } = b;
  const text = JSON.stringify(rest).replaceAll(`fenmyrmedia://media/${copyOfVideo}`, `fenmyrmedia://media/${video}`);
  return JSON.parse(text, (k, v) => (k === 'board' && typeof v === 'string' ? ids[v] : v));
};
const now = { [String(kid.id)]: 'KID', [String(deeper.id)]: 'DEEP' };
for (const [id, copy] of [
  ['r1', root],
  ['r2', kid],
  ['r3', deeper],
] as const) {
  const before = exported.find(b => b.id === id);
  assert.ok(before, `board ${id} was on disk`);
  assert.deepStrictEqual(normal(copy, now), normal(before, { r2: 'KID', r3: 'DEEP' }), `${id} came back as it went`);
}
assert.notStrictEqual(copyOfVideo, video, 'the video has a name of its own');
assert.ok(
  fs.readFileSync(path.join(mediaDir, copyOfVideo)).equals(fs.readFileSync(path.join(mediaDir, video))),
  'and is the same video',
);
assert.ok(
  (Array.isArray(root.cards) ? root.cards : []).map(rec).some(c => c.src === 'beta/welcome.mp4'),
  'a video bundled with the app is still only its address',
);

// the board is open, fitted to its cards, and the video plays
assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard()?.id), root.id, 'the imported board is open');
// loaded, or failed: the page says which, and a player that is somebody else's never gets there
await page.waitForFunction(
  () => {
    const v = document.querySelector<HTMLVideoElement>('#cards [data-id="vd"] video');
    return !!v && (v.readyState >= 1 || !!v.error);
  },
  null,
  { timeout: 10_000 },
);
const playing = await page.evaluate(() => {
  const v = document.querySelector<HTMLVideoElement>('#cards [data-id="vd"] video');
  return { error: !v || !!v.error, width: v?.videoWidth ?? 0, src: v?.dataset.src ?? '' };
});
assert.deepStrictEqual(
  playing,
  { error: false, width: 64, src: `fenmyrmedia://media/${copyOfVideo}` },
  'the imported video loads from its own file, and has its picture',
);
assert.notDeepStrictEqual(
  await page.evaluate(() => window.__fenmyr.curBoard()?.view),
  { x: 200, y: 150, z: 1 },
  "the view was fitted, not the exporter's",
);

// a canvas opens from its card, and the one inside it from there
await page.evaluate(id => window.__fenmyr.openBoard(id), String(kid.id));
assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard()?.name), 'Plans', 'the first canvas opens');
await page.evaluate(id => window.__fenmyr.openBoard(id), String(deeper.id));
assert.strictEqual(await page.evaluate(() => window.__fenmyr.curBoard()?.name), 'Deep', 'and the one inside it');
assert.strictEqual(await page.locator('#cards .card.note').count(), 1, 'with its note');

// twice: two boards, two videos
await importFromHome(app, page, zipPath, 'Roadmap 3');
const twice = readBoards(l.data).filter(b => !originals.has(String(b.id)) && !after.some(a => a.id === b.id));
assert.strictEqual(twice.length, 3, 'a second copy came in beside the first');
assert.strictEqual(new Set([...after, ...twice].map(b => b.id)).size, 6, 'with no id shared with the first copy');
assert.ok(
  twice.some(b => b.name === 'Roadmap 3'),
  'and a number of its own',
);
assert.strictEqual(
  fs.readdirSync(mediaDir).filter(n => n.endsWith('.webm')).length,
  3,
  'the video came in twice, as two files',
);

// the sweep keeps an imported video
process.env.XDG_DATA_HOME = l.data;
const { sweepMedia } = await import('../src/host/storage.ts');
const decoy = path.join(mediaDir, 'nobody-uses-this.webm');
fs.writeFileSync(decoy, 'x');
const old = new Date(Date.now() - 3 * 86400 * 1000);
for (const f of fs.readdirSync(mediaDir)) fs.utimesSync(path.join(mediaDir, f), old, old);
sweepMedia();
assert.ok(!fs.existsSync(decoy), 'a video no board uses is swept once it is old');
assert.ok(fs.existsSync(path.join(mediaDir, copyOfVideo)), 'an imported video is still there after sweepMedia() runs');
assert.ok(fs.existsSync(path.join(mediaDir, video)), 'and so is the first');

console.log('zipRoundTrip ok');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
