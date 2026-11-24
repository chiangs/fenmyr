// Find matches every word a card draws, and it never matches the app's own words. The words are read from the page (the text
// inside each card, and what sits in a field a card holds) and not from a list of fields, so a card that draws a word Find
// can't reach fails here and the failure names its type and the words. EXAMPLES gives each card type a value for every field
// that draws text, and a new card type fails tsc until it has one. Nothing checks that a new text field is given a value there.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type CardType, isCardType, sizeOf } from '../src/shared/cardTypes.ts';
import type { CardOf } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

type Example<T extends CardType> = Omit<CardOf<T>, 'id' | 'type' | 'x' | 'y' | 'w' | 'h'> & { w?: number; h?: number };
type Variant = { [T in CardType]: { id: string; type: T } & Example<T> }[CardType];

// Every word is made up (Zq…) so none can be found by chance on another card
const EXAMPLES = {
  note: { text: 'Zqnote words', name: 'Zqnotename', tagText: 'Zqnotelabel', tags: ['zqtag'], due: '2020-01-01' },
  todo: {
    text: 'Zqchecklist',
    items: [{ t: 'Zqitemone', done: true }, { t: 'Zqitemtwo' }],
    tagText: 'Zqlistlabel',
    due: '2020-01-01',
  },
  title: { text: 'Zqtitle' },
  image: {
    src: 'stamps/myra-happy.png',
    tagText: 'Zqcaption',
    capture: { commit: 'abc1234def', device: 'Zqphone', width: 390, at: Date.UTC(2026, 10, 20, 9, 30) },
  },
  link: { url: 'https://zqsite.example/page', title: 'Zqlinktitle', desc: 'Zqlinkdesc', tagText: 'Zqlinklabel' },
  swatch: { hex: '#c0ffee', label: 'Zqcolour' },
  coll: {
    text: 'Zqcollection',
    kids: [],
    kanban: true,
    cols: 3,
    colNames: ['Zqtodo', 'Zqdoing', 'Zqdone'],
    colLimit: [0, 0, 0],
    colOf: {},
    w: 836,
    h: 300,
  },
  doc: { text: 'Zqdocname', body: '<p>Zqdocbody</p>' },
  canvas: { text: 'Zqcanvas' },
  shape: { shape: 'rect', fill: 'blue', text: 'Zqshape' },
  stamp: { emoji: '⭐' },
  audio: { title: 'Zqmemo', text: 'Zqmemowords', dur: 12 },
  video: { title: 'Zqvideo', notIncluded: true },
  spotify: {
    title: 'Zqspotify',
    url: 'https://open.spotify.com/track/abcdefghij12',
    kind: 'track',
    sid: 'abcdefghij12',
  },
  ink: {
    pts: [
      [0, 0],
      [50, 40],
    ],
    ow: 50,
    oh: 40,
  },
  frame: { name: 'Zqscreen' },
  section: { text: 'Zqsection' },
  box: { img: 'Zqboxwords' },
  text: { text: 'Zqloose' },
  icon: { name: 'star' },
  font: { font: 'Figtree', text: 'Zqsample' },
  vnote: { vault: 'v1', path: 'Zqvaultnote.md' },
  path: {
    pts: [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 40, y: 60 },
    ],
    closed: true,
    ow: 80,
    oh: 60,
  },
  unknown: { original: {} },
} satisfies { [T in CardType]: Example<T> };

// Other faces of a type: a link that hasn't loaded, one with only an address, and the back of a vault note
const VARIANTS: Variant[] = [
  { id: 'link-draft', type: 'link', draft: 'zqdraft.example/typed' },
  { id: 'link-bare', type: 'link', url: 'https://zqbare.example/page' },
  { id: 'vnote-back', type: 'vnote', vault: 'v1', path: 'Zqvaultnote.md', side: 'back' },
];

// The app's own words, which Find never matches. A text node that is exactly one of these is left out, and the reason is
// why it isn't a word a person put on the board.
const CHROME: Record<string, string> = {
  'empty canvas': 'a canvas that holds no board says so',
  Aa: 'the font card’s specimen of its letters',
  'On your computer': 'where the font card got its font',
  'Video not included in this file': 'what a video left out of its zip says',
  'Needs a newer Fenmyr':
    'the placeholder for a card this build can’t read; tests/unknownCards.ts checks Find leaves it alone',
  "This card can't be shown here. It stays in the board as it was.": 'the same placeholder, which has no type to name',
  '0:12': 'an audio card’s length, worked out from its recording',
};
// Types whose example draws no words: pictures made of points, an icon, a stamp, and a placeholder that says only the app's own
const WORDLESS: CardType[] = ['stamp', 'ink', 'icon', 'path', 'unknown'];
// Where the words aren't one a person wrote: buttons and what they do, and the count a column or collection keeps (a count
// would make "3" match every card that has one)
const NOT_WORDS = 'button, [data-act], .kb-n';

// A vault the board may read, with the one note the vault cards show
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-fc-'));
const vaultDir = path.join(data, 'vault');
fs.mkdirSync(vaultDir, { recursive: true });
fs.writeFileSync(
  path.join(vaultDir, 'Zqvaultnote.md'),
  '---\nzqstatus: zqdraft\ntags: [zqvaulttag]\n---\nZqexcerpt words from the vault.\n',
);
fs.mkdirSync(path.join(data, 'fenmyr'), { recursive: true });
fs.writeFileSync(
  path.join(data, 'fenmyr', 'vaults.json'),
  JSON.stringify({
    vaults: [{ id: 'v1', name: 'vault', path: vaultDir, obsidian: 'vault', off: [], obsidianFolder: false }],
  }),
);

const PER_ROW = 2400,
  GAP = 40;
let x = 0,
  y = 0,
  rowH = 0;
const place = (id: string, type: CardType, fields: Record<string, unknown>) => {
  const [w0, h0] = sizeOf(type),
    w = typeof fields.w === 'number' ? fields.w : w0,
    h = typeof fields.h === 'number' ? fields.h : h0;
  if (x + w > PER_ROW) {
    x = 0;
    y += rowH + GAP;
    rowH = 0;
  }
  const card = { r: 0, ...fields, id, type, x, y, w, h };
  x += w + GAP;
  rowH = Math.max(rowH, h);
  return card;
};
const cards = [
  ...Object.entries(EXAMPLES).flatMap(([type, fields]) =>
    isCardType(type) ? [place(`ex-${type}`, type, fields)] : [],
  ),
  ...VARIANTS.map(({ id, type, ...fields }) => place(id, type, fields)),
];
const board = {
  id: 'b1',
  name: 'Every card',
  cards,
  links: [],
  tray: [],
  view: { x: 100, y: 100, z: 0.4 },
  vaultAccess: [{ vault: 'v1', folders: [''], ai: false, write: false, writeTo: '' }],
};

const l = await launch({ boards: [board], data });
try {
  const { page, app } = l;
  // The Spotify card plays Spotify's own page in a frame, whose errors would count as the app's, and the words checked here
  // are drawn outside it. So the board opens only once that page is answered with nothing.
  await app.context().route(/open\.spotify\.com/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '' }));
  await page.evaluate(() => window.__fenmyr.openBoard('b1'));
  await page.evaluate(() => window.__fenmyr.refreshVNotes());
  await page.waitForFunction(n => document.querySelectorAll('#cards .card').length === n, cards.length);
  await still(page);

  // what each card draws, word by word: its text, minus the buttons and the app's own words, and what sits in its fields
  const drawn = await page.evaluate(skip => {
    return [...document.querySelectorAll<HTMLElement>('#cards .card')].map(card => {
      const parts: string[] = [];
      const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode())
        if (!n.parentElement?.closest(skip)) parts.push(n.textContent ?? '');
      // a link that hasn't loaded holds the address typed so far in a field
      for (const f of card.querySelectorAll('input, textarea')) {
        const typed = f instanceof HTMLTextAreaElement || (f instanceof HTMLInputElement && f.type === 'text');
        if (typed && f.value) parts.push(f.value);
      }
      return { id: card.dataset.id ?? '', nodes: parts.map(p => p.trim()).filter(Boolean) };
    });
  }, NOT_WORDS);

  const words = (nodes: string[]) => [
    ...new Set(
      nodes
        .filter(n => !Object.hasOwn(CHROME, n))
        .flatMap(n => n.toLowerCase().split(/\s+/))
        .filter(Boolean),
    ),
  ];

  // Ctrl+F asks in Myra's chat, and sending it puts up the bar; from then on the field is typed into. A link that hasn't loaded
  // takes the focus when it is drawn, and Ctrl+F is not for a field.
  await page.evaluate(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined,
  );
  await page.keyboard.press('Control+f');
  await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
  await still(page);
  // filled, not typed: with every transition late, the chat's field is not yet where it can take the focus the page gave it
  await page.fill('#mcInput', '/find zq');
  await page.press('#mcInput', 'Enter');
  await page.waitForFunction(() => document.getElementById('findBar')?.checkVisibility());

  // The cards Find leaves lit for a query: the ones that match, and none when nothing does, for Find dims nothing then.
  // Clearing first means the count always changes, so it says when the answer is in.
  async function lit(query: string) {
    await page.fill('#fbQ', '');
    await page.waitForFunction(() => document.getElementById('fbCount')?.textContent === 'Type to find');
    await page.fill('#fbQ', query);
    await page.waitForFunction(() => document.getElementById('fbCount')?.textContent !== 'Type to find');
    return page.evaluate(() =>
      /^\d+ of \d+/.test(document.getElementById('fbCount')?.textContent ?? '')
        ? [...document.querySelectorAll('#cards .card:not(.dim)')].flatMap(e =>
            e instanceof HTMLElement && e.dataset.id ? e.dataset.id : [],
          )
        : [],
    );
  }

  const gaps: string[] = [];
  for (const { id, nodes } of drawn) {
    const type = cards.find(c => c.id === id)?.type;
    const all = words(nodes);
    if (!all.length) {
      if (type && !WORDLESS.includes(type) && id === `ex-${type}`)
        gaps.push(`${type} (${id}) draws no words: give its example a value for each field that draws text`);
      continue;
    }
    if ((await lit(all.join(' '))).includes(id)) continue;
    const missed: string[] = [];
    for (const w of all) if (!(await lit(w)).includes(id)) missed.push(w);
    gaps.push(`${type} (${id}) draws ${missed.map(w => `“${w}”`).join(', ')} and Find can't match it`);
  }
  assert.strictEqual(gaps.length, 0, `Find misses words that cards draw:\n  ${gaps.join('\n  ')}\n`);

  assert.deepStrictEqual(l.errors, [], 'no page errors');
  console.log('FIND COVERAGE OK');
} finally {
  await l.close();
  fs.rmSync(data, { recursive: true, force: true });
}
