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
  for (const k of keys) card[k] = 1;
  card.rec = true;
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
