// What Myra's replies do to a board, her chat, the library and the templates, pinned against a golden file so a
// change in how a reply is applied cannot go unnoticed. `node tests/replies.ts --write` records it from this build.
//
// The golden file was first recorded from apply.ts as it was before #241. Changed on purpose since:
// - "I touched N cards" counts each card once. A card she moved and edited counted twice, and fewer cards can mean
//   no guessed next steps.
// - Cards a template adds to the board, and her vault note cards, are among the cards she touched: a template she
//   saves "from new" keeps them, she glides to them, counts them and guesses next steps from them.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import type { Page } from 'playwright';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const GOLDEN = path.join(import.meta.dirname, 'fixtures/replies.json');
const writing = process.argv.includes('--write');
const SCENARIOS = ['everything', 'vault', 'library', 'buttons', 'counted', 'newBoard'] as const;
const boards = SCENARIOS.map(id => replyBoard(id, id));

// ids the fixture gave; every other id was made by the reply, and is named @1, @2… in the order it first appears
const known = new Set<string>(SCENARIOS);
for (const b of boards) {
  const lists = [b.cards, b.tray, b.links, b.trayLinks].flatMap(l => (Array.isArray(l) ? l : []));
  for (const x of lists) if (typeof x === 'object' && x !== null && 'id' in x) known.add(String(x.id));
}
// tilt is random, a template's `made` is a time, and the view follows the glide to what she made
const DROP = new Set(['r', 'made', 'view']);

function normalize(x: unknown) {
  const names = new Map<string, string>();
  const collect = (v: unknown, keys: Set<string>, key = '') => {
    if (Array.isArray(v)) for (const item of v) collect(item, keys);
    else if (typeof v === 'object' && v !== null) for (const [k, val] of Object.entries(v)) collect(val, keys, k);
    else if (typeof v === 'string' && keys.has(key) && !known.has(v) && !names.has(v))
      names.set(v, `@${names.size + 1}`);
  };
  collect(x, new Set(['id']));
  collect(x, new Set(['group', 'tie']));
  const rename = (s: string) => names.get(s) ?? (s.startsWith('data:') ? 'data' : s);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object' && v !== null)
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k, val]) => !DROP.has(k) && val !== undefined)
          .map(([k, val]) => [rename(k), walk(val)]),
      );
    return typeof v === 'string' ? rename(v) : v;
  };
  return walk(x);
}

async function shot(page: Page) {
  return page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    const chat = [...document.querySelectorAll('#mcList .mc-msg:not(.typing)')].map(d => ({
      who: d.classList.contains('me') ? 'me' : 'myra',
      text: d.firstChild?.textContent ?? '',
      acts: [...d.querySelectorAll('.m-acts button')].map(a => a.textContent ?? ''),
    }));
    return {
      board: {
        name: b.name,
        cards: b.cards,
        links: b.links,
        tray: b.tray,
        trayLinks: b.trayLinks ?? [],
        tags: b.tags ?? [],
      },
      chat,
      timer: window.__fenmyr.timerState()?.purpose ?? null,
    };
  });
}

async function open(page: Page, id: string) {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await page.waitForTimeout(300);
}

const l = await launch({ boards, open: 'everything', settings: { emoji: false } });
const { page } = l;
await page.evaluate(() => {
  document.getElementById('mPill')?.click();
  const picture = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c.toDataURL('image/png');
  };
  window.Fenmyr.fetchImage = async (url: string) => {
    if (url === 'bad') throw new Error('no picture there');
    return url === 'tall' ? picture(30, 60) : picture(40, 30);
  };
});
await settle(page);
const result: Record<string, unknown> = {};

// 1. every change a reply can make to the board, in one reply
await page.evaluate(() =>
  window.__fenmyr.applyMyra(
    {
      say: 'Here you go.',
      collections: [
        { name: 'Sprint', kanban: true, columns: ['Now', 'Next'] },
        { name: 'Loose ends', color: 'butter' },
      ],
      add: [
        { type: 'todo', text: 'Trip', items: ['tickets', { t: 'bags', done: true }] },
        { type: 'title', text: 'A heading' },
        { type: 'swatch', hex: '#336699', label: 'Sea' },
        { type: 'doc', text: 'Notes doc', body: '# Notes\n\nHello' },
        { type: 'font', font: 'Lora', sample: 'The quick fox' },
        {
          text: 'Filed note',
          in: 'Sprint',
          column: 'Next',
          tags: ['idea', 'new one'],
          due: '2026-12-01',
          color: 'mint',
        },
        { text: 'Into the backlog', in: 'kb', column: 'Done' },
        { text: 'Placed note', x: 1300, y: 100 },
      ],
      titles: [{ text: 'Big title' }],
      place: [{ id: 'u1' }],
      move: [{ id: 'n1', x: 40, y: 1100, color: 'pink' }],
      edit: [
        { id: 't1', text: 'Errands today', items: ['milk', 'eggs'] },
        { id: 'n2', text: 'Second note, longer', tags: ['idea'], due: '2026-12-02', size: 'l' },
        { id: 'k1', text: 'Write the brief and send it round to the whole team before Friday, so they can read it' },
        { id: 'n4', in: 'Loose ends' },
        { id: 'i1', in: '' },
        { id: 'u3', text: 'Loose idea, edited' },
        { id: 'd1', body: '# Plan\n\nSecond draft' },
        { id: 's1', hex: '#AA5500', label: 'Rust' },
        { id: 'gone', text: 'Not here' },
      ],
      remove: ['n3', 'u4'],
      connect: [['n1', 'n2'], { a: 'n2', b: 'n3' }],
      screens: [
        {
          name: 'Home',
          items: [
            { piece: 'Nav bar', title: 'Home' },
            { piece: 'Text', text: 'Hello' },
            { piece: 'Image', img: 'A garden' },
          ],
        },
      ],
      images: [{ url: 'wide', caption: 'First' }, { url: 'bad' }, { url: 'tall', x: 2200, y: 0 }],
    },
    'do everything',
  ),
);
await page.waitForTimeout(2000);
result.everything = await shot(page);

// 2. vault notes: only the ones she was given, once each, and the line about what she read
await open(page, 'vault');
await page.evaluate(async () => {
  const note = (rel: string, title: string) => ({
    vault: 'Notes',
    vaultId: 'v1',
    rel,
    title,
    tags: ['vault'],
    props: undefined,
    excerpt: `${title} excerpt`,
    text: `${title} text`,
  });
  const used = [note('a.md', 'Alpha'), note('b.md', 'Beta')];
  await window.__fenmyr.applyMyra(
    {
      say: 'From your vault.',
      vaultNotes: [
        { vault: 'Notes', path: 'a.md' },
        { vault: 'Notes', path: 'a.md' },
        { vault: 'Notes', path: 'zzz.md' },
        { vault: 'Notes', path: 'b.md' },
      ],
    },
    'what do my notes say',
    { asked: true, used },
  );
  await new Promise(r => setTimeout(r, 700));
  await window.__fenmyr.applyMyra({ say: 'Nothing there.' }, 'anything else', { asked: true, used: [] });
});
await page.waitForTimeout(700);
result.vault = await shot(page);

// 3. the library and templates: folders and projects, moving this board, using, saving and editing templates
await open(page, 'library');
await page.evaluate(async () => {
  await window.__fenmyr.saveAsTemplate('Starter', ['n1', 'n2'], { mode: 'add' });
  await window.__fenmyr.saveAsTemplate('Old name', ['s1'], { mode: 'add' });
  await window.__fenmyr.applyMyra(
    {
      say: 'Sorted.',
      projects: { create: ['Garden'] },
      folders: {
        create: [{ name: 'Plans', project: 'Garden' }, 'Loose'],
        rename: [{ from: 'Loose', to: 'Odds' }],
        move: [{ board: 'library', folder: 'Plans', project: 'Garden' }],
      },
      useTemplate: { name: 'Starter', mode: 'add' },
      add: [{ text: 'For the template' }],
      saveTemplate: { name: 'From new', fromNew: true, description: 'Made by Myra' },
      editTemplate: { name: 'Old name', newName: 'New name', description: 'Renamed', mode: 'new' },
    },
    'tidy my library',
  );
});
await page.waitForTimeout(1000);
result.library = {
  ...(await shot(page)),
  library: await page.evaluate(() => window.__fenmyr.lib()),
  templates: await page.evaluate(async () =>
    (await window.Fenmyr.templates()).sort((a, b) => a.name.localeCompare(b.name)),
  ),
};

// 4. her buttons: confirm, the vault offer with no vault, next steps given and guessed, emoji off, timer, animation
await open(page, 'buttons');
for (const r of [
  { say: 'Shall I make it?', confirm: 'Yes, build it' },
  { say: 'Maybe the vault?', offerVault: true },
  { say: 'What next? 🎉', next: ['Do this 🎉', 'Then that', 'And more', 'Too many'] },
  { say: 'A swatch for you.', add: [{ type: 'swatch', hex: '#123456' }] },
  { say: 'Tea time 👋', timer: { minutes: 5, purpose: 'Tea' }, animate: 'happy' },
])
  await page.evaluate(async r => {
    await window.__fenmyr.applyMyra(r, 'a question');
    await new Promise(res => setTimeout(res, 700));
  }, r);
result.buttons = { ...(await shot(page)), anim: await page.evaluate(() => window.__fenmyr.lastAnimName()) };

// 5. no words from her: she counts what she touched, or just says she's done
await open(page, 'counted');
for (const r of [
  { add: [{ text: 'One' }], move: [{ id: 'n1', x: 50, y: 1100 }], edit: [{ id: 'n1', text: 'Moved and edited' }] },
  { remove: ['n2'] },
])
  await page.evaluate(async r => {
    await window.__fenmyr.applyMyra(r, 'go');
    await new Promise(res => setTimeout(res, 700));
  }, r);
result.counted = await shot(page);

// 6. a template that opens a new board: the rest of the reply lands there
await open(page, 'newBoard');
await page.evaluate(async () => {
  await window.__fenmyr.saveAsTemplate('Fresh', ['t1'], { mode: 'new' });
  await window.__fenmyr.applyMyra(
    { say: 'A new board.', useTemplate: { name: 'Fresh', mode: 'new' }, add: [{ text: 'On the new board' }] },
    'start fresh',
  );
});
await page.waitForTimeout(1000);
result.newBoard = await shot(page);

const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
const now = Object.fromEntries(Object.entries(result).map(([k, v]) => [k, normalize(v)]));
if (writing) {
  fs.writeFileSync(GOLDEN, `${JSON.stringify(now, null, 1)}\n`);
  console.log(`wrote ${GOLDEN}`);
} else {
  const golden: unknown = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert(typeof golden === 'object' && golden !== null);
  const differ = Object.entries(now).filter(([k, v]) => !util.isDeepStrictEqual(v, Reflect.get(golden, k)));
  for (const [k, v] of differ) {
    try {
      assert.deepStrictEqual(v, Reflect.get(golden, k), k);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
  }
  assert.deepStrictEqual(
    differ.map(([k]) => k),
    [],
    'replies that differ from the golden file',
  );
}
console.log('REPLIES OK');
