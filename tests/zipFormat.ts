// The Fenmyr zip's format with no app running: the strip table decides what leaves, parseExport() reads a set of
// unzipped files and refuses the ones it shouldn't, and the browser's in-memory zip comes back as it went in.
import assert from 'node:assert';
import {
  DEFAULTS,
  type ExportOptions,
  KEEP_ALL,
  KEPT,
  mediaNameIn,
  mediaUsed,
  noCut,
  STRIP,
  stripBoard,
} from '../src/shared/fenmyrStrip.ts';
import {
  buildZip,
  FORMAT,
  importable,
  jsonBytes,
  makeManifest,
  nameRefusal,
  packZip,
  parseExport,
  plainName,
  REFUSALS,
  readImport,
  readManifest,
  readZip,
  relinkMedia,
} from '../src/shared/fenmyrZip.ts';
import { parseBoard } from '../src/shared/model.ts';
import { board, build, byId, card, manifestFor, rec, text, zipOf } from './support/zipKit.ts';

const refusal = (r: ReturnType<typeof readZip>) => (r.ok ? 'accepted' : r.refusal);

// the strip table
// one field per row, so the table itself says what goes and when
const sample = (field: string) =>
  field === 'chat' || field === 'chats' ? [{ role: 'user', text: 'hi' }] : `<${field}>`;
const options = (on: Partial<ExportOptions>): ExportOptions => ({
  videos: false,
  chats: false,
  vaultText: false,
  ...on,
});
const boardRows = STRIP.filter(r => r.from === 'board');
const fullBoard = {
  ...board('b1', { color: 'mint', palette: [{ hex: '#ffffff' }], tags: ['x'], bg: 'dots', view: { x: 1, y: 2, z: 1 } }),
  ...Object.fromEntries(boardRows.flatMap(r => r.fields.map(f => [f, sample(f)]))),
  trayLinks: [],
  cards: [
    card('v', 'video', {
      src: 'fenmyrmedia://media/a.mp4',
      poster: 'data:image/jpeg;base64,xx',
      title: 'Clip',
      text: 'words',
    }),
    card('bundled', 'video', { src: 'beta/welcome.mp4', title: 'Welcome' }),
    card('n', 'vnote', { vault: 'v1', path: 'a.md', title: 'Note', excerpt: 'secret', props: [['k', 'v']] }),
    card('i', 'image', { src: 'data:image/png;base64,xx', capture: { commit: 'abc' } }),
    card('u', 'unknown', { original: { id: 'u', type: 'vnote', path: 'b.md', excerpt: 'hidden' } }),
  ],
};

const decided = new Set<string>([...KEPT.board, ...boardRows.flatMap(r => r.fields)]);
assert.deepStrictEqual(
  Object.keys(fullBoard).filter(k => !decided.has(k)),
  [],
  'every board field is decided: kept, or in the strip table',
);
assert.deepStrictEqual(
  STRIP.filter(r => r.keep === 'never').flatMap(r => r.fields),
  ['chatDraft', 'vaultAccess', 'kind', 'proto', 'capture', 'vault', 'path', 'repo', 'vaults', 'kind'],
  'what is always left out',
);
assert.deepStrictEqual(
  STRIP.filter(r => r.keep !== 'never' && !DEFAULTS[r.keep]).flatMap(r => r.fields),
  ['chat', 'chats', 'excerpt', 'props'],
  'what is left out unless ticked',
);

// by default: the always-out rows and the unticked ones go; nothing else changes
const cut = noCut(),
  byDefault = stripBoard(fullBoard, DEFAULTS, cut);
for (const r of boardRows) {
  const gone = r.keep === 'never' || !DEFAULTS[r.keep];
  for (const f of r.fields) assert.strictEqual(f in byDefault, !gone, `board ${f}: ${gone ? 'left out' : 'kept'}`);
}
for (const f of KEPT.board) assert.strictEqual(f in byDefault, f in fullBoard, `board ${f} is kept`);
assert.deepStrictEqual(
  [byId(byDefault, 'n').vault, byId(byDefault, 'n').path, byId(byDefault, 'n').excerpt, byId(byDefault, 'n').props],
  [undefined, undefined, undefined, undefined],
  'a vault note loses its links and its text',
);
assert.strictEqual(byId(byDefault, 'n').title, 'Note', 'and keeps its name');
assert.strictEqual(byId(byDefault, 'n').notIncluded, true, 'and is marked');
assert.strictEqual(byId(byDefault, 'i').capture, undefined, 'a capture loses its commit link');
assert.strictEqual(byId(byDefault, 'i').src, 'data:image/png;base64,xx', 'but keeps its picture');
assert.strictEqual(byId(byDefault, 'v').src, 'fenmyrmedia://media/a.mp4', 'a video stays with videos on');
assert.deepStrictEqual(cut, { videos: 0, chats: true, vaultText: 2 }, 'what it cost: chats, and two notes');
assert.deepStrictEqual(
  rec(byId(byDefault, 'u').original),
  { id: 'u', type: 'vnote', unlinked: true, notIncluded: true },
  'a card this build could not read is cut the same way',
);

// with everything ticked only the always-out rows go
const ticked = stripBoard(fullBoard, KEEP_ALL);
assert.deepStrictEqual(
  ['chat', 'chats', 'chatDraft', 'vaultAccess', 'kind', 'proto'].filter(k => k in ticked),
  ['chat', 'chats'],
  'ticked chats stay, the rest never do',
);
assert.strictEqual(byId(ticked, 'n').excerpt, 'secret', 'ticked vault text stays');
assert.strictEqual(byId(ticked, 'n').vault, undefined, 'but never the vault it came from');
assert.strictEqual(byId(ticked, 'n').notIncluded, undefined, 'and then the card is not marked');
assert.strictEqual(byId(ticked, 'n').unlinked, true, 'but it is marked as having no vault to be read from again');

// unticked videos: the card stays, and says so
const videoCut = noCut(),
  plain = stripBoard(fullBoard, options({ chats: true, vaultText: true }), videoCut);
for (const k of ['src', 'poster'])
  assert.strictEqual(byId(plain, 'v')[k], undefined, `a left-out video loses its ${k}`);
assert.deepStrictEqual(
  [byId(plain, 'v').title, byId(plain, 'v').text],
  ['Clip', 'words'],
  'and keeps its name and words',
);
assert.strictEqual(byId(plain, 'v').notIncluded, true);
assert.strictEqual(byId(plain, 'bundled').src, 'beta/welcome.mp4', 'a video bundled with the app stays a reference');
assert.strictEqual(videoCut.videos, 1, 'one video was left out, not the bundled one');
assert.deepStrictEqual(mediaUsed([fullBoard, fullBoard]), ['a.mp4'], 'a video is listed once');
assert.deepStrictEqual(mediaUsed([plain]), [], 'and none when they are left out');
assert.strictEqual(mediaNameIn('fenmyrmedia://media/x.mp4'), 'x.mp4');
assert.strictEqual(mediaNameIn('https://example.com/media/x.mp4'), null);

// the manifest
const m = makeManifest(
  { kind: 'board', id: 'b1' },
  { boards: ['b1'], media: [], left: { videos: 0, chats: false, vaultText: 0, missingCanvases: 0 } },
  build,
);
assert.deepStrictEqual(
  [m.fenmyr, m.format, m.app, m.commit, m.changes, m.platform],
  ['export', FORMAT, '1.1.0-beta.1', 'a'.repeat(40), true, 'linux'],
  'it says what made it',
);
const read = readManifest(JSON.parse(JSON.stringify(m)));
assert.ok(read.ok && read.value.root.kind === 'board', 'a manifest reads back');
assert.strictEqual(importable('board'), null);
for (const kind of ['folder', 'project'] as const)
  assert.strictEqual(importable(kind), 'later', `a ${kind} zip is read, and not placed yet`);

// parseExport: what it accepts
const one = zipOf(manifestFor(['b1']), { b1: board('b1', { cards: [card('c', 'note', { text: 'hi' })] }) });
const opened = readZip(one);
assert.ok(opened.ok, 'a board zip is accepted');
assert.deepStrictEqual(
  [opened.value.boards.length, opened.value.skipped, opened.value.manifest.root],
  [1, 0, { kind: 'board', id: 'b1' }],
);
for (const kind of ['folder', 'project'] as const) {
  // a folder or project zip names its root among its folders and projects; every board is in boards/
  const bigger = {
    ...manifestFor(['b1', 'b2']),
    root: { kind, id: kind === 'project' ? 'p1' : 'f1' },
    projects: kind === 'project' ? [{ id: 'p1', name: 'Acme', color: 'mint' }] : [],
    folders: [{ id: 'f1', name: 'Plans', project: kind === 'project' ? 'p1' : null, parent: null }],
  };
  const r = readZip(zipOf(bigger, { b1: board('b1'), b2: board('b2') }));
  assert.ok(r.ok, `a ${kind} zip is accepted`);
  assert.deepStrictEqual(
    [
      r.value.manifest.root.kind,
      r.value.manifest.folders.length,
      r.value.manifest.projects.length,
      r.value.boards.length,
    ],
    [kind, 1, kind === 'project' ? 1 : 0, 2],
    `its structure comes through (${kind})`,
  );
  const lost = { ...bigger, root: { kind, id: 'nowhere' } };
  assert.strictEqual(
    refusal(readZip(zipOf(lost, { b1: board('b1'), b2: board('b2') }))),
    'notZip',
    `a ${kind} that is not listed`,
  );
}

// parseExport: what it refuses
assert.strictEqual(refusal(readZip(packZip({ 'notes.txt': text('hi') }))), 'notZip', 'a plain zip is not ours');
assert.strictEqual(refusal(readZip(text('not a zip at all'))), 'notZip', 'neither is a file that is not a zip');
assert.strictEqual(refusal(readZip(packZip({ 'fenmyr.json': text('{nope') }))), 'notZip', 'or a damaged manifest');
assert.strictEqual(refusal(readZip(packZip({ 'fenmyr.json': jsonBytes({ fenmyr: 'other', format: 1 }) }))), 'notZip');
assert.strictEqual(
  refusal(readZip(zipOf({ ...manifestFor(['b1']), format: FORMAT + 1 }, { b1: board('b1') }))),
  'newer',
  'a newer format',
);
assert.strictEqual(
  refusal(readZip(zipOf({ ...manifestFor(['b1']), format: 0 }, { b1: board('b1') }))),
  'notZip',
  'a format that is not a version',
);
assert.strictEqual(refusal(readZip(zipOf(manifestFor(['b1']), {}))), 'notZip', 'a manifest whose board is not there');
assert.strictEqual(
  refusal(readZip(zipOf(manifestFor(['b1']), { b1: { name: 'no id' } }))),
  'notZip',
  'or whose board has no id',
);
for (const bad of [
  '../evil.json',
  '/etc/passwd',
  'boards/../../evil.json',
  'media/../x',
  'C:/x',
  'media\\x',
  'boards/b1.json\0',
]) {
  const zip = packZip({
    'fenmyr.json': jsonBytes(manifestFor(['b1'])),
    'boards/b1.json': jsonBytes(board('b1')),
    [bad]: text('x'),
  });
  assert.strictEqual(refusal(readZip(zip)), 'unsafe', `an entry named ${JSON.stringify(bad)} is refused`);
}
assert.strictEqual(
  refusal(readZip(packZip({ '../evil.txt': text('x') }))),
  'unsafe',
  'a name that leaves the folder is refused even when the zip is not ours',
);
for (const outside of [
  'evil.txt',
  'boards/sub/x.json',
  'boards/b1.txt',
  'media/sub/x.mp4',
  'media/.hidden',
  '__MACOSX/x',
]) {
  const zip = packZip({
    'fenmyr.json': jsonBytes(manifestFor(['b1'])),
    'boards/b1.json': jsonBytes(board('b1')),
    [outside]: text('x'),
  });
  assert.strictEqual(refusal(readZip(zip)), 'unsafe', `${outside} is outside the three places`);
}
assert.strictEqual(nameRefusal(['fenmyr.json', 'boards/b1.json', 'boards/b1.json']), 'unsafe', 'a name twice');
assert.strictEqual(nameRefusal(['fenmyr.json', 'boards/', 'media/', 'boards/b1.json', 'media/a.mp4']), null);
for (const name of ['a.mp4', '3f2a-uuid.webm', 'x']) assert.ok(plainName(name), `${name} is a plain file name`);
for (const name of ['', '.', '..', 'a/b', 'a\\b', '.hidden', '../x', 'a\0b', 'x'.repeat(200)])
  assert.ok(!plainName(name), `${JSON.stringify(name)} is not`);
for (const media of ['../x.mp4', 'a/b.mp4', '..', '/abs']) {
  const manifest = { ...manifestFor(['b1']), media: [media] };
  assert.strictEqual(refusal(readZip(zipOf(manifest, { b1: board('b1') }))), 'notZip', `a manifest listing ${media}`);
}
for (const id of ['../b', 'b/1', '']) {
  const manifest = { ...manifestFor(['b1']), boards: [id] };
  assert.strictEqual(
    refusal(readZip(zipOf(manifest, { b1: board('b1') }))),
    'notZip',
    `a manifest listing board ${id}`,
  );
}

// parseExport: the parts that are not whole
const odd = readZip(
  zipOf(manifestFor(['b1', 'b2']), {
    b1: board('b1', {
      cards: [card('ok', 'note'), { type: 'note', x: 0, y: 0 }, 7, card('zz', 'zorblax', { glitter: 1 })],
      tray: [card('t', 'note'), null],
    }),
  }),
);
assert.ok(odd.ok, 'a zip with a missing canvas board and bad cards is accepted');
assert.strictEqual(odd.value.skipped, 3, 'a card with no id, a number and a null are skipped and counted');
assert.deepStrictEqual(
  odd.value.boards[0]?.cards?.map(c => c.type),
  ['note', 'unknown'],
  'and one this build cannot read stays as a placeholder',
);
assert.deepStrictEqual(
  odd.value.boards.map(b => b.id),
  ['b1'],
  'the board that is not there is simply absent',
);

// whatever a zip claims, what is always left out is left out again: it can't give a board a vault or a code folder
const hostile = readZip(
  zipOf(manifestFor(['b1']), {
    b1: board('b1', {
      vaultAccess: [{ vault: 'v', folders: [''], ai: true }],
      kind: 'prototype',
      proto: { dir: 'x', stack: 'react' },
      chatDraft: { text: 'x' },
      cards: [
        card('n', 'vnote', { vault: 'v', path: 'p.md', excerpt: 'kept' }),
        card('i', 'image', { capture: { c: 1 } }),
      ],
    }),
  }),
);
assert.ok(hostile.ok);
const hb = hostile.value.boards[0];
assert.deepStrictEqual(
  [hb?.vaultAccess, hb?.kind, hb?.proto, hb?.chatDraft],
  [undefined, undefined, undefined, undefined],
  'no vault access, no prototype link, no draft',
);
assert.deepStrictEqual(
  [byId(rec(hb), 'n').vault, byId(rec(hb), 'n').path, byId(rec(hb), 'n').excerpt, byId(rec(hb), 'i').capture],
  [undefined, undefined, 'kept', undefined],
  'cards lose their links to this computer and keep their words',
);

// the videos on the way in
const withVideos = parseBoard(
  board('b1', {
    cards: [
      card('a', 'video', { src: 'fenmyrmedia://media/old1.mp4', poster: 'p', title: 'A' }),
      card('b', 'video', { src: 'fenmyrmedia://media/gone.mp4', title: 'B' }),
      card('c', 'video', { src: 'idbmedia:xyz', title: 'C' }),
      card('d', 'video', { src: 'beta/welcome.mp4', title: 'D' }),
    ],
  }),
);
assert.ok(withVideos);
const relinked = relinkMedia([withVideos], new Map([['old1.mp4', 'fenmyrmedia://media/new1.mp4']]));
const at = (id: string) => byId(rec(relinked.boards[0]), id);
assert.strictEqual(at('a').src, 'fenmyrmedia://media/new1.mp4', 'a copied video points at its copy');
assert.strictEqual(at('a').poster, 'p', 'and keeps its still');
for (const id of ['b', 'c']) {
  assert.strictEqual(at(id).src, undefined, `video ${id} has no file here`);
  assert.strictEqual(at(id).notIncluded, true, `and says so (${id})`);
}
assert.strictEqual(at('d').src, 'beta/welcome.mp4', 'a bundled video is untouched');
assert.strictEqual(relinked.missing, 2, 'two videos had no copy');

// the browser's zip, whole in memory
const made = stripBoard(fullBoard, DEFAULTS);
const web = buildZip(manifestFor(['b1']), [made]);
const back = readZip(web);
assert.ok(back.ok, 'what the browser builds, it reads');
assert.deepStrictEqual(rec(back.value.boards[0]).name, 'b1');
assert.strictEqual(back.value.boards[0]?.chat, undefined, 'and chats are not in it');
assert.deepStrictEqual(
  readImport(JSON.parse(JSON.stringify(back.value)))?.boards.map(b => b.id),
  ['b1'],
  'the host reply is read the same way',
);
for (const bad of [null, 'x', 7, {}, { manifest: {}, boards: [] }, { manifest: { fenmyr: 'export', format: 9 } }])
  assert.strictEqual(readImport(bad), null, `a reply of ${JSON.stringify(bad)} is not an import`);
assert.match(REFUSALS.later, /Folder and project zips aren't supported yet/);
assert.deepStrictEqual(
  Object.keys(REFUSALS).sort(),
  ['later', 'newer', 'notZip', 'tooBig', 'unsafe'],
  'each way to be refused has its words',
);

assert.strictEqual(parseExport(['fenmyr.json', 'boards/b1.json'], {}).ok, false, 'names with no files are not a zip');

console.log('zipFormat ok');
