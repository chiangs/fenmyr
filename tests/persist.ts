// A saved card keeps its content and loses what only mattered while the app was running.
import assert from 'node:assert';
import fs from 'node:fs';
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
