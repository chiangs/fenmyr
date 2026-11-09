// A saved card keeps its content and loses what only mattered while the app was running.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';

const RUNNING_ONLY = ['count', 'starting', 'saving', 'pct', 'camErr', 'camRest', 'loading', 'cropEdit'];
const l = await launch({ boards: [everyOfflineCard()], open: 'every' });
await l.page.evaluate(async keys => {
  const board = window.__fenmyr.curBoard();
  if (!board) throw new Error('no board open');
  const card = board.cards.find(c => c.id === 'note');
  if (!card) throw new Error('no note');
  // flags no card type declares, which is the point: saving must strip them anyway
  for (const k of keys) Reflect.set(card, k, 1);
  Reflect.set(card, 'rec', true);
  await window.Fenmyr?.save(board);
}, RUNNING_ONLY);
const file = path.join(l.data, 'fenmyr', 'boards', 'every.json');
const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
await l.close();
assert(typeof saved === 'object' && saved !== null && 'cards' in saved && Array.isArray(saved.cards));
const note: unknown = saved.cards.find(c => c.id === 'note');
assert(typeof note === 'object' && note !== null);
assert.deepStrictEqual(
  RUNNING_ONLY.filter(k => k in note),
  [],
);
assert('rec' in note, 'an interrupted recording is found by its saved rec flag');
assert('text' in note, 'content is kept');
console.log('PERSIST OK');

// A prototype board keeps its chat with chat saving off, and switching the setting again clears plain boards only.
const msg = { who: 'myra', text: 'An earlier answer.', t: 1 };
const cartNote = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, text: 'Cart' };
const protoBoard = {
  id: 'proto',
  name: 'Checkout',
  kind: 'prototype',
  proto: { dir: 'prototypes/checkout', stack: 'react' },
  cards: [cartNote],
  links: [],
  tray: [],
  chat: [msg],
};
const plainBoard = { id: 'plain', name: 'Plain', cards: [cartNote], links: [], tray: [], chat: [msg] };
const p = await launch({ boards: [protoBoard, plainBoard], open: 'proto', settings: { chatKeep: 'off' } });
await p.page.evaluate(async () => {
  await window.__fenmyr.applyMyra({ say: 'I built two screens.' }, 'build this flow');
  document
    .querySelector('[data-seg="chatKeep"] [data-v="session"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
const onDisk = (id: string) => path.join(p.data, 'fenmyr', 'boards', `${id}.json`);
const said = (id: string): string[] => {
  const b: unknown = JSON.parse(fs.readFileSync(onDisk(id), 'utf8'));
  const chat = typeof b === 'object' && b !== null && 'chat' in b && Array.isArray(b.chat) ? b.chat : [];
  return chat.map(m => (typeof m === 'object' && m !== null && 'text' in m ? String(m.text) : ''));
};
const deadline = Date.now() + 5000;
while (Date.now() < deadline && !(said('proto').includes('I built two screens.') && said('plain').length === 0))
  await p.page.waitForTimeout(100);
const proto = said('proto'),
  plain = said('plain');
await p.close();
assert(proto.includes('An earlier answer.'), 'switching chat saving keeps a prototype board’s saved chat');
assert(proto.includes('I built two screens.'), 'a prototype board saves new chat with chat saving off');
assert.deepStrictEqual(plain, [], 'switching chat saving still clears a plain board’s chat');
console.log('PROTOTYPE CHAT OK');

// Her stored buttons come back from the board file, and a reply's are written to it and come back after a restart.
const shown = (page: typeof p.page, text: string) =>
  page.evaluate(text => {
    document.getElementById('mPill')?.click();
    const m = [...document.querySelectorAll('#mcList .mc-msg')].find(d => d.firstChild?.textContent === text);
    return m ? [...m.querySelectorAll('.m-acts button')].map(b => b.textContent) : null;
  }, text);
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-acts-'));
const stored = {
  id: 'acts',
  name: 'Acts',
  cards: [cartNote],
  links: [],
  tray: [],
  chat: [
    {
      who: 'myra',
      text: 'From the file.',
      t: 1,
      acts: [
        { kind: 'next', text: 'Make it a list' },
        { kind: 'offer', board: 'x' },
        { kind: 'source', card: 'n' },
        { kind: 'source', card: 'gone' },
        { kind: 'commit', board: 'acts', message: 'Add the cart' },
      ],
    },
  ],
};
let a = await launch({ boards: [stored], open: 'acts', data });
try {
  assert.deepStrictEqual(
    await shown(a.page, 'From the file.'),
    ['↗ Cart', 'Make it a list'],
    'a board saved with buttons opens with them, in their rows’ order, without kinds it doesn’t know, cards that are gone or a Commit for a board that isn’t a prototype',
  );
  await a.page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Saved with me.', next: ['Sort them'] }, 'q'));
  const file = path.join(data, 'fenmyr', 'boards', 'acts.json');
  const savedNext = () => {
    const b = JSON.parse(fs.readFileSync(file, 'utf8'));
    return b.chat.find((m: { text: string }) => m.text === 'Saved with me.')?.acts?.[0];
  };
  const until = Date.now() + 5000;
  while (Date.now() < until && !savedNext()) await a.page.waitForTimeout(100);
  assert.deepStrictEqual(savedNext(), { kind: 'next', text: 'Sort them' }, 'a reply’s next step is written to disk');
  await a.close();
  a = await launch({ open: 'acts', data });
  assert.deepStrictEqual(await shown(a.page, 'Saved with me.'), ['Sort them'], 'and is back after a restart');
} finally {
  await a.close();
  fs.rmSync(data, { recursive: true, force: true });
}
console.log('STORED BUTTONS OK');

// A draft in the board file is back in Myra's input, a malformed one is not, and saving a board keeps the draft it has.
const drafted = {
  id: 'drafted',
  name: 'Drafted',
  cards: [cartNote],
  links: [],
  tray: [],
  chatDraft: { text: 'Half a thought' },
};
const broken = { id: 'broken', name: 'Broken', cards: [cartNote], links: [], tray: [], chatDraft: { text: 5 } };
const d = await launch({ boards: [drafted, broken], open: 'drafted', settings: { chatKeep: 'board' } });
try {
  const inputOf = (id: string) =>
    d.page.evaluate(async id => {
      await window.__fenmyr.openBoard(id);
      const box = document.getElementById('mcInput');
      return box instanceof HTMLTextAreaElement ? box.value : null;
    }, id);
  assert.strictEqual(await inputOf('drafted'), 'Half a thought', 'a stored draft fills the input');
  await d.page.evaluate(() => window.Fenmyr?.save(window.__fenmyr.curBoard()));
  const file = path.join(d.data, 'fenmyr', 'boards', 'drafted.json');
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(file, 'utf8')).chatDraft,
    { text: 'Half a thought' },
    'saving keeps it',
  );
  assert.strictEqual(await inputOf('broken'), '', 'a draft with the wrong shape is left out');
} finally {
  await d.close();
}
console.log('STORED DRAFT OK');
