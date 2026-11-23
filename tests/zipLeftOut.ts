// What a zip leaves out, read from the zip itself and not only from what comes back. Always: the unsent draft, vault
// access, a vault note's vault and path, a prototype's link and a capture's commit. By default as well: Myra's chats,
// the text of vault notes and, unless unticked, the videos. A left-out video and a left-out note keep their cards and
// say so; ticked, the chats and the text come through, and the size in the dialog follows the ticks.
import assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openZip } from '../src/shared/fenmyrZip.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { card, dialogsAnswer, rec } from './support/zipKit.ts';
import { exportRow, importFromHome, readBoards, saidSaved } from './support/zipUi.ts';

const video = '7e1d9a52-0000-4222-8333-444455556666.mp4';
const mk = (id: string, name: string, more: Record<string, unknown>) => ({
  id,
  name,
  cards: [],
  links: [],
  tray: [],
  ...more,
});
const secret = mk('t1', 'Private', {
  cards: [
    card('n', 'note', { text: 'Just a note' }),
    card('v', 'vnote', {
      vault: 'v1',
      path: 'Plans/a.md',
      title: 'Plan note',
      excerpt: 'SECRET-EXCERPT',
      props: [['status', 'SECRET-PROP']],
    }),
    card('i', 'image', { src: 'data:image/png;base64,AAAA', capture: { commit: 'abc123', dir: 'prototypes/x' } }),
    card('vd', 'video', { src: `fenmyrmedia://media/${video}`, title: 'Clip', text: 'WORDS-SAID', dur: 2 }),
    card('bu', 'video', { src: 'beta/welcome.mp4', title: 'Welcome' }),
    card('c', 'canvas', { text: 'Inner', board: 't2' }),
  ],
  chat: [{ who: 'me', text: 'CHAT-SECRET', t: 1 }],
  chats: [{ id: 'old', title: 'Old chat', t: 1, msgs: [{ who: 'me', text: 'OLD-CHAT-SECRET', t: 1 }] }],
  chatDraft: { text: 'DRAFT-SECRET' },
  vaultAccess: [{ vault: 'v1', folders: [''], ai: true, write: false, writeTo: 'Myra' }],
});
const inner = mk('t2', 'Inner', {
  parent: 't1',
  cards: [card('x', 'note', { text: 'Inside' })],
  kind: 'prototype',
  proto: { dir: 'prototypes/inner', stack: 'html' },
  chat: [{ who: 'me', text: 'INNER-CHAT-SECRET', t: 1 }],
});

// the board that is open is another one: opening a board with a vault note it can't read forgets the note's text
const l = await launch({
  boards: [secret, inner, mk('o', 'Opened', { cards: [card('on', 'note', { text: 'Open' })] })],
  open: 'o',
});
const { page, app } = l;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-left-'));
const mediaDir = path.join(l.data, 'fenmyr', 'media');
fs.writeFileSync(path.join(mediaDir, video), randomBytes(2_500_000));
const originals = new Set(['t1', 't2', 'o']);
const read = (file: string) => {
  const zip = openZip(new Uint8Array(fs.readFileSync(file)), true);
  const boards = Object.fromEntries(
    Object.entries(zip.json)
      .filter(([n]) => n.startsWith('boards/'))
      .map(([n, b]) => [n.slice(7, -5), Buffer.from(b).toString()]),
  );
  const manifest = rec(JSON.parse(Buffer.from(zip.json['fenmyr.json'] ?? []).toString()));
  return { zip, boards, manifest, all: Object.values(boards).join('\n') };
};
const cardOf = (json: string | undefined, id: string) => {
  const b = rec(JSON.parse(json ?? '{}'));
  return rec((Array.isArray(b.cards) ? b.cards : []).map(rec).find(c => c.id === id));
};
const exportTo = async (file: string, ticks: Record<string, boolean>) => {
  await dialogsAnswer(app, file, null);
  const dialog = await exportRow(page, 'Private');
  for (const [id, on] of Object.entries(ticks)) await dialog.tick(id, on);
  await dialog.ok();
  await saidSaved(page, 'Private');
};

// by default
const plain = path.join(out, 'plain.zip');
await dialogsAnswer(app, plain, null);
const dialog = await exportRow(page, 'Private');
assert.deepStrictEqual(
  dialog.checked,
  { zxVideos: true, zxChats: false, zxVault: false },
  'videos are ticked, and chats and the text of vault notes are not',
);
assert.match(dialog.text, /Include videos \(3 MB\)/, 'the size of the videos is in the tick');
assert.match(dialog.text, /Include my chats with Myra/);
assert.match(dialog.text, /Include the text of vault notes/);
const withVideos = await dialog.what();
assert.match(withVideos, /2 boards \(1 inside canvases\)/);
assert.match(withVideos, /1 picture/);
assert.match(withVideos, /1 video\b/, 'the bundled video is not counted: it is not going');
assert.match(withVideos, /about 3 MB/);
await dialog.tick('zxVideos', false);
assert.ok(!/video/.test(await dialog.what()), 'with the videos unticked they are not counted');
assert.match(await dialog.what(), /about \d+ KB/, 'and the size follows');
await dialog.tick('zxVideos', true);
assert.match(await dialog.what(), /about 3 MB/, 'and follows back');
await dialog.ok();
await saidSaved(page, 'Private');
const by = read(plain);
for (const word of [
  'CHAT-SECRET',
  'OLD-CHAT-SECRET',
  'INNER-CHAT-SECRET',
  'DRAFT-SECRET',
  'SECRET-EXCERPT',
  'SECRET-PROP',
  'abc123',
  'Plans/a.md',
  'prototypes/inner',
])
  assert.ok(!by.all.includes(word), `${word} is not in the zip`);
for (const key of [
  'chat',
  'chats',
  'chatDraft',
  'vaultAccess',
  'kind',
  'proto',
  'capture',
  'excerpt',
  'props',
  'vault',
  'path',
])
  assert.ok(!by.all.includes(`"${key}":`), `no "${key}" key is in the zip, in any board`);
assert.strictEqual(cardOf(by.boards.t1, 'v').title, 'Plan note', 'a vault note keeps its name');
assert.strictEqual(cardOf(by.boards.t1, 'v').notIncluded, true, 'and says its text is not in it');
assert.strictEqual(cardOf(by.boards.t1, 'vd').src, `fenmyrmedia://media/${video}`, 'a video stays with videos ticked');
assert.ok(by.zip.media[video]?.length === 2_500_000, 'and is in media/');
assert.strictEqual(cardOf(by.boards.t1, 'bu').src, 'beta/welcome.mp4', 'a video bundled with the app is a reference');
assert.deepStrictEqual(Object.keys(by.zip.media), [video], 'and adds nothing to media/');
assert.deepStrictEqual(
  by.manifest.left,
  { videos: 0, chats: true, vaultText: 1, missingCanvases: 0 },
  'the zip says what it left out',
);

// opened, the note says so and nothing of it came
await importFromHome(app, page, plain, 'Private 2');
await still(page);
const first = readBoards(l.data).filter(b => !originals.has(String(b.id)) && b.name === 'Private 2');
assert.strictEqual(first.length, 1);
const firstCards = first[0]?.cards,
  note = rec((Array.isArray(firstCards) ? firstCards : []).map(rec).find(c => c.id === 'v'));
assert.deepStrictEqual(
  [note.vault, note.path, note.excerpt, note.props, note.notIncluded],
  [undefined, undefined, undefined, undefined, true],
);
assert.match(await page.locator('#cards [data-id="v"]').innerText(), /Text not included/, 'the card says it');
assert.match(await page.locator('#cards [data-id="v"]').innerText(), /Plan note/, 'beside its name');
assert.strictEqual(first[0]?.chat, undefined, 'there are no chats on the copy');
assert.match(
  (await page.evaluate(() => document.getElementById('mSay')?.textContent)) ?? '',
  /The chats weren't in the zip\. The text of 1 vault note wasn't in the zip\./,
  'Myra says what was left out',
);

// ticked
await page.locator('#homeBtn').click();
const ticked = path.join(out, 'ticked.zip');
await exportTo(ticked, { zxVideos: false, zxChats: true, zxVault: true });
const on = read(ticked);
for (const word of ['CHAT-SECRET', 'OLD-CHAT-SECRET', 'INNER-CHAT-SECRET', 'SECRET-EXCERPT', 'SECRET-PROP'])
  assert.ok(on.all.includes(word), `${word} came with the tick`);
for (const word of ['DRAFT-SECRET', 'abc123', 'Plans/a.md', 'prototypes/inner'])
  assert.ok(!on.all.includes(word), `${word} still never goes`);
for (const key of ['chatDraft', 'vaultAccess', 'kind', 'proto', 'capture', 'vault', 'path'])
  assert.ok(!on.all.includes(`"${key}":`), `"${key}" is never in the zip, ticked or not`);
assert.deepStrictEqual(Object.keys(on.zip.media), [], 'with videos unticked media/ is empty');
assert.deepStrictEqual(on.manifest.media, []);
const gone = cardOf(on.boards.t1, 'vd');
assert.deepStrictEqual(
  [gone.src, gone.poster, gone.notIncluded],
  [undefined, undefined, true],
  'the video card is marked',
);
assert.deepStrictEqual([gone.title, gone.text], ['Clip', 'WORDS-SAID'], 'and keeps its name and its words');
assert.strictEqual(cardOf(on.boards.t1, 'v').notIncluded, undefined, 'a note whose text came is not marked');
assert.deepStrictEqual(on.manifest.left, { videos: 1, chats: false, vaultText: 0, missingCanvases: 0 });

await importFromHome(app, page, ticked, 'Private 3');
await still(page);
const second = readBoards(l.data).find(b => b.name === 'Private 3');
assert.ok(second, 'the second copy is here');
const chatText = JSON.stringify([second.chat, second.chats]);
assert.ok(chatText.includes('CHAT-SECRET') && chatText.includes('OLD-CHAT-SECRET'), 'the chats came through');
assert.match(
  await page.locator('#cards [data-id="vd"]').innerText(),
  /Video not included in this file/,
  'the video card says so',
);
assert.match(await page.locator('#cards [data-id="vd"]').innerText(), /Clip/, 'beside its name');
assert.match(
  await page.locator('#cards [data-id="v"]').innerText(),
  /SECRET-EXCERPT|Plan note/,
  'the note has its words',
);
assert.strictEqual(
  await page.locator('#cards [data-id="v"] .vn-gone').count(),
  0,
  'and does not say its text is missing',
);
assert.match(
  (await page.evaluate(() => document.getElementById('mSay')?.textContent)) ?? '',
  /1 video wasn't in the zip\./,
);
assert.strictEqual(
  fs.readdirSync(mediaDir).length,
  2,
  'only the first zip had a video to copy in: the original and its copy',
);

console.log('zipLeftOut ok');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
