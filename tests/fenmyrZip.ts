// The Fenmyr zip through the host: what the two operations write and read on disk. A zip is written a piece at a time
// and read back by the index at its end, so a video that holds the bytes of a zip header comes back whole. A zip with a
// name that leads out of the media folder, or sits outside the three places, or is not ours, or is from a newer
// Fenmyr, is refused with nothing created. Cards that can't be kept and videos that are not there are counted.
import assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  jsonBytes,
  type Manifest,
  makeManifest,
  openZip,
  packZip,
  REFUSALS,
  readImport,
} from '../src/shared/fenmyrZip.ts';
import { launch } from './support/launch.ts';
import {
  board,
  build,
  card,
  dialogAsked,
  dialogsAnswer,
  hostOp,
  manifestFor,
  rec,
  text,
  zipOf,
} from './support/zipKit.ts';

const l = await launch();
const { page, app } = l;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-zip-'));
const op = (name: string, args: Record<string, unknown>) => hostOp(page, name, args),
  answer = (saveAs: string | null, open: string | null) => dialogsAnswer(app, saveAs, open),
  asked = () => dialogAsked(app);
const mediaDir = path.join(l.data, 'fenmyr', 'media');
const inMedia = () => fs.readdirSync(mediaDir).sort();

const sig = (a: number, b: number) => Buffer.from([0x50, 0x4b, a, b]);
const zipFile = (name: string, bytes: Uint8Array) => {
  const f = path.join(out, name);
  fs.writeFileSync(f, bytes);
  return f;
};
const imported = (r: { ok: boolean; value: unknown }) => {
  assert.ok(r.ok, `the import was refused: ${String(r.value)}`);
  const got = readImport(r.value);
  assert.ok(got, 'the reply is an import');
  return got;
};
const refused = (r: { ok: boolean; value: unknown }) => {
  assert.ok(!r.ok, 'the import was not refused');
  return String(r.value);
};

// a video that holds what a zip is made of: the signatures of a local header, a data descriptor and the index
const video = Buffer.concat([
  randomBytes(1 << 20),
  sig(7, 8),
  randomBytes(12),
  sig(3, 4),
  randomBytes(2 << 20),
  sig(1, 2),
  sig(5, 6),
  randomBytes(777),
]);
const gone = { ...board('b1'), cards: [card('v', 'video', { src: 'fenmyrmedia://media/old.mp4', title: 'Clip' })] };
const manifestWith = (more: Record<string, unknown>) => ({ ...manifestFor(['b1'], ['old.mp4']), ...more });
const withVideo = (bytes: Uint8Array, name = 'old.mp4') =>
  packZip({
    'fenmyr.json': jsonBytes(manifestFor(['b1'], [name])),
    'boards/b1.json': jsonBytes(gone),
    [`media/${name}`]: bytes,
  });

// a video goes out in pieces and comes back whole
const original = 'f3a2b1c0-0000-4000-8000-000000000000.mp4';
fs.writeFileSync(path.join(mediaDir, original), video);
fs.writeFileSync(path.join(mediaDir, 'unused.mp4'), 'x');
const exportedBoard = {
  ...gone,
  cards: [card('v', 'video', { src: `fenmyrmedia://media/${original}`, title: 'Clip' })],
};
const manifest = makeManifest(
  { kind: 'board', id: 'b1' },
  { boards: ['b1'], media: [original], left: { videos: 0, chats: false, vaultText: 0, missingCanvases: 0 } },
  build,
);
const target = path.join(out, 'Acme.fenmyr.zip');
await answer(target, null);
const saved = await op('zipExport', { name: 'Acme', manifest, boards: [exportedBoard] });
assert.ok(saved.ok && saved.value === target, `the export answers with the saved path (${String(saved.value)})`);
assert.strictEqual(await asked(), path.join(l.data, 'Acme.fenmyr.zip'), 'the dialog starts on <name>.fenmyr.zip');
const inside = openZip(new Uint8Array(fs.readFileSync(target)), true);
assert.deepStrictEqual(
  [...inside.names].sort(),
  ['boards/b1.json', 'fenmyr.json', `media/${original}`],
  'the zip holds the manifest, the board and the video, and nothing else',
);
assert.ok(Buffer.from(inside.media[original] ?? []).equals(video), 'the video in the zip is the video, byte for byte');
assert.deepStrictEqual(rec(JSON.parse(Buffer.from(inside.json['fenmyr.json'] ?? []).toString())).media, [original]);
// the video is stored, not deflated: the index says method 0 for it, and 8 for the files that are deflated
const raw = fs.readFileSync(target);
const methodOf = (name: string) => {
  for (let at = raw.indexOf(sig(1, 2)); at >= 0; at = raw.indexOf(sig(1, 2), at + 4))
    if (raw.toString('utf8', at + 46, at + 46 + raw.readUInt16LE(at + 28)) === name) return raw.readUInt16LE(at + 10);
  return -1;
};
assert.deepStrictEqual(
  [`media/${original}`, 'fenmyr.json', 'boards/b1.json'].map(methodOf),
  [0, 8, 8],
  'the video is stored as it is, the JSON is deflated',
);

const first = imported(await op('zipImport', { path: target }));
const copies = inMedia().filter(n => n !== original && n !== 'unused.mp4');
assert.strictEqual(copies.length, 1, 'one video was copied in');
assert.ok(fs.readFileSync(path.join(mediaDir, copies[0] ?? '')).equals(video), 'and it is the video, byte for byte');
assert.notStrictEqual(copies[0], original, 'under a new name');
assert.match(copies[0] ?? '', /^[0-9a-f-]{36}\.mp4$/, 'named as a video made here is');
const src = rec(first.boards[0]?.cards?.[0]).src;
assert.strictEqual(src, `fenmyrmedia://media/${copies[0]}`, 'and the card points at the copy');
assert.deepStrictEqual([first.skipped, first.missing, first.manifest.root], [0, 0, { kind: 'board', id: 'b1' }]);

// a zip made by another tool, with its video deflated, comes in as well
const deflated = imported(await op('zipImport', { path: zipFile('deflated.zip', withVideo(video)) }));
assert.strictEqual(deflated.missing, 0);
assert.strictEqual(inMedia().length, 2 + 2, 'it is another file: coming in twice makes two');
assert.notStrictEqual(rec(deflated.boards[0]?.cards?.[0]).src, src, 'with a name of its own');

// the dialog: no path opens it, and changing their mind makes nothing
await answer(null, null);
assert.strictEqual((await op('zipImport', {})).value, null, 'cancelling the open dialog answers null');
assert.strictEqual(
  (await op('zipExport', { name: 'Acme', manifest, boards: [exportedBoard] })).value,
  null,
  'and the save dialog',
);
await answer(null, target);
assert.strictEqual(
  imported(await op('zipImport', {})).boards.length,
  1,
  'with no path the open dialog chooses the file',
);
const before = inMedia();

// a zip that leads out, or is not ours, makes nothing
const listed = (extra: Record<string, Uint8Array>) =>
  packZip({
    'fenmyr.json': jsonBytes(manifestFor(['b1'], ['old.mp4'])),
    'boards/b1.json': jsonBytes(gone),
    'media/old.mp4': video,
    ...extra,
  });
const nothing = (what: string) =>
  assert.deepStrictEqual(inMedia(), before, `nothing was written to the media folder (${what})`);
const outside = path.join(os.tmpdir(), `fenmyr-outside-${process.pid}`);
const leaving = [
  '../outside.txt',
  '../../outside.txt',
  'media/../outside.txt',
  outside,
  'media/../../outside.txt',
  '\\outside.txt',
];
for (const name of leaving) {
  const message = refused(await op('zipImport', { path: zipFile('leaving.zip', listed({ [name]: text('x') })) }));
  assert.strictEqual(message, REFUSALS.unsafe, `${name} is refused as unsafe`);
  nothing(name);
  for (const f of [
    outside,
    path.join(l.data, 'outside.txt'),
    path.join(l.data, 'fenmyr', 'outside.txt'),
    path.join(mediaDir, '..', 'outside.txt'),
  ])
    assert.ok(!fs.existsSync(f), `nothing was written to ${f}`);
}
for (const name of ['evil.txt', 'boards/sub/x.json', 'media/sub/x.mp4', 'media/.hidden', 'other/x.json']) {
  const message = refused(await op('zipImport', { path: zipFile('outside.zip', listed({ [name]: text('x') })) }));
  assert.strictEqual(message, REFUSALS.unsafe, `${name} is outside the three places`);
  nothing(name);
}
// a video listed under a name that is not a plain file name is not ours
for (const name of ['../old.mp4', 'a/b.mp4', '/etc/x']) {
  const bad = { ...manifestWith({}), media: [name] };
  const message = refused(
    await op('zipImport', {
      path: zipFile('listed.zip', packZip({ 'fenmyr.json': jsonBytes(bad), 'boards/b1.json': jsonBytes(gone) })),
    }),
  );
  assert.strictEqual(message, REFUSALS.notZip, `a manifest listing ${name}`);
  nothing(name);
}

// the refusals, each with its words
const refusals: [string, Uint8Array, string][] = [
  ['a plain zip', packZip({ 'notes.txt': text('hi') }), REFUSALS.notZip],
  ['a plain zip that leaves the folder', packZip({ '../notes.txt': text('hi') }), REFUSALS.unsafe],
  ['a file that is not a zip', text('not a zip'), REFUSALS.notZip],
  ['an empty file', new Uint8Array(0), REFUSALS.notZip],
  ['a zip with a damaged manifest', packZip({ 'fenmyr.json': text('{') }), REFUSALS.notZip],
  ['a newer format', zipOf({ ...manifestFor(['b1']), format: 2 }, { b1: board('b1') }), REFUSALS.newer],
];
for (const [what, bytes, words] of refusals) {
  assert.strictEqual(refused(await op('zipImport', { path: zipFile('refused.zip', bytes) })), words, what);
  nothing(what);
}
// a truncated zip, and one whose video was changed after it was written, are not ours either
const whole = fs.readFileSync(target);
assert.strictEqual(
  refused(await op('zipImport', { path: zipFile('cut.zip', whole.subarray(0, whole.length - 40)) })),
  REFUSALS.notZip,
  'a cut zip',
);
const flipped = Buffer.from(whole);
flipped[2000] = (flipped[2000] ?? 0) ^ 0xff;
assert.strictEqual(
  refused(await op('zipImport', { path: zipFile('flipped.zip', flipped) })),
  REFUSALS.notZip,
  'a zip with a changed byte',
);
nothing('a damaged video');
assert.strictEqual(
  refused(await op('zipImport', { path: 'relative/path.zip' })),
  REFUSALS.notZip,
  'a path that is not absolute',
);
assert.strictEqual(refused(await op('zipImport', { path: out })), REFUSALS.notZip, 'a folder');
assert.strictEqual(
  refused(await op('zipImport', { path: path.join(out, 'missing.zip') })),
  REFUSALS.notZip,
  'a file that is not there',
);
// over 4 GB is refused before it is opened as a zip: a sparse file is that big without taking the room
const huge = path.join(out, 'huge.zip');
fs.writeFileSync(huge, '');
fs.truncateSync(huge, 4 * 2 ** 30 + 1);
assert.strictEqual(refused(await op('zipImport', { path: huge })), REFUSALS.tooBig, 'a file over 4 GB');
fs.rmSync(huge);
nothing('too big');

// the parts that are not whole
const odd = zipOf(manifestFor(['b1', 'b2']), {
  b1: {
    ...board('b1'),
    cards: [card('ok', 'note'), { type: 'note' }, 7, card('v', 'video', { src: 'fenmyrmedia://media/missing.mp4' })],
    tray: [null],
  },
});
const partial = imported(await op('zipImport', { path: zipFile('partial.zip', odd) }));
assert.strictEqual(partial.skipped, 3, 'a card with no id, a number and a null are skipped and counted');
assert.strictEqual(partial.missing, 1, 'a video that is not in the zip is counted');
const marked = rec(partial.boards[0]?.cards?.find(c => c.id === 'v'));
assert.deepStrictEqual([marked.src, marked.notIncluded], [undefined, true], 'and its card is marked, and kept');
assert.deepStrictEqual(
  partial.boards.map(b => b.id),
  ['b1'],
  'a canvas board that is not there is not made up',
);
nothing('a missing video');

// a manifest that lists a video the zip doesn't hold
const listedOnly = imported(
  await op('zipImport', {
    path: zipFile(
      'listedonly.zip',
      packZip({ 'fenmyr.json': jsonBytes(manifestWith({})), 'boards/b1.json': jsonBytes(gone) }),
    ),
  }),
);
assert.strictEqual(listedOnly.missing, 1, 'a video the manifest lists and the zip lacks');
nothing('a listed video that is missing');

// the export checks what it is given
await answer(path.join(out, 'bad.zip'), null);
const badArgs: [string, Record<string, unknown>][] = [
  ['no manifest', { name: 'x', boards: [board('b1')] }],
  ['a video named with a path', { name: 'x', manifest: { ...manifest, media: ['../x.mp4'] }, boards: [exportedBoard] }],
  [
    'a manifest that names a board it was not given',
    { name: 'x', manifest: { ...manifest, boards: ['b1', 'b2'] }, boards: [exportedBoard] },
  ],
  ['a board the manifest does not name', { name: 'x', manifest, boards: [exportedBoard, board('b9')] }],
];
for (const [what, args] of badArgs) {
  const r = await op('zipExport', args);
  assert.ok(!r.ok && r.value === "I couldn't make that zip.", `${what} is refused (${String(r.value)})`);
  assert.ok(!fs.existsSync(path.join(out, 'bad.zip')), `and nothing is written (${what})`);
}
// a video that has gone from this computer is left out, and the zip says so
const lost = { ...manifest, media: [original, 'vanished.mp4'] };
await answer(path.join(out, 'lost.zip'), null);
assert.ok((await op('zipExport', { name: 'x', manifest: lost, boards: [exportedBoard] })).ok);
const lostRead = openZip(new Uint8Array(fs.readFileSync(path.join(out, 'lost.zip'))), true);
const lostManifest: Manifest = JSON.parse(Buffer.from(lostRead.json['fenmyr.json'] ?? []).toString());
assert.deepStrictEqual(
  [lostManifest.media, lostManifest.left.videos],
  [[original], 1],
  'a missing video is listed as left out',
);
assert.deepStrictEqual(Object.keys(lostRead.media), [original], 'and is not in the zip');
// a name with a slash can't make the file land somewhere else
await answer(path.join(out, 'slash.zip'), null);
assert.ok((await op('zipExport', { name: 'a/b', manifest, boards: [exportedBoard] })).ok);
assert.strictEqual(await asked(), path.join(l.data, 'a-b.fenmyr.zip'), 'a slash in the name becomes a dash');

console.log('fenmyrZip host ok');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
