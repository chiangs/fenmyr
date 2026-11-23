import type { Template } from '../../shared/ops.ts';
import { FRAMEWORKS } from '../content/frameworks.ts';
import { placeFramework, STARTERS } from '../content/placeFramework.ts';
import { hasAll } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { createBoard, createWithCards, type Place } from '../library/create.ts';
import { newBoard, TEMPLATES } from '../model/boards.ts';
import { reply, type SayAction } from '../myra/say.ts';
import { startPrototypeHere } from '../repo/start.ts';
import { clickIn } from '../ui/dom.ts';
import { myTpls, useTemplate } from './templates.ts';

// key: what the picker's data-* holds (a saved template's id), and what /template matches
export type TemplateEntry = {
  key: string;
  name: string;
  line: string;
  group: string;
  kind: 'framework' | 'starter' | 'mine' | 'prototype';
  opens: 'here' | 'new';
};

// not a set of cards but a prototype: it goes through startPrototype, and its board starts with Myra's notes
const PROTOTYPE = 'prototype';

// grouped by what you're doing; frameworks add to this board, starters open a new one
const TPL_GROUPS: [heading: string, keys: string[]][] = [
  ['Think', ['empathy', 'journey', 'affinity', 'hmw', 'opportunity', 'matrix']],
  ['Capture', ['Moodboard', 'Brain dump']],
  ['Plan', ['OKRs and opportunities', 'Product kickoff', 'App plan', 'Workshop planning', 'kanban']],
  ['Look back', ['retro']],
  ['Build', [PROTOTYPE]],
];

const PROTOTYPE_LINE = 'A clickable prototype Myra codes from your wireframes and notes';

const mineLine = (t: Template) => t.desc || `${t.cards.length} card${t.cards.length === 1 ? '' : 's'}`;

export const tagOf = (e: TemplateEntry) =>
  e.kind === 'prototype' ? 'Opens a new prototype ↗' : e.opens === 'new' ? 'Opens a new board ↗' : 'Adds to this board';

// every template the picker offers, in its order, with the person's own last
export function templateEntries(): TemplateEntry[] {
  const made = TPL_GROUPS.flatMap(([group, keys]) =>
    keys.flatMap((key): TemplateEntry[] => {
      if (key === PROTOTYPE)
        return [{ key, name: 'Prototype', line: PROTOTYPE_LINE, group, kind: 'prototype', opens: 'new' }];
      const F = FRAMEWORKS[key];
      if (F) return [{ key, name: F.name, line: F.line, group, kind: 'framework', opens: 'here' }];
      const starter = STARTERS[key];
      return TEMPLATES[key] && starter
        ? [{ key, name: key, line: starter[0], group, kind: 'starter', opens: 'new' }]
        : [];
    }),
  );
  const mine = myTpls.map(
    (t): TemplateEntry => ({
      key: t.id,
      name: t.name,
      line: mineLine(t),
      group: 'Yours',
      kind: 'mine',
      opens: t.mode === 'new' ? 'new' : 'here',
    }),
  );
  return [...made, ...mine];
}

// What a click in the picker does, for each kind. With a place, each kind but the prototype makes a board there and
// shows it, so the caller can take the person to a new project: a framework, which adds to the open board when there
// is no place, goes on a blank board.
export async function runTemplate(entry: TemplateEntry, at?: Place): Promise<void> {
  switch (entry.kind) {
    case 'prototype':
      return startPrototypeHere();
    case 'framework':
      if (!at) return placeFramework(entry.key);
      // placeFramework fills the open board, so the new one is opened first
      await createBoard(at, { board: newBoard(entry.name), open: 'board' });
      return placeFramework(entry.key);
    case 'starter':
      await createWithCards(newBoard(entry.name, entry.name), at);
      return;
    case 'mine': {
      const t = myTpls.find(x => x.id === entry.key);
      if (t) await useTemplate(t, at ? 'new' : undefined, at);
      return;
    }
    default: {
      const unhandled: never = entry.kind;
      return unhandled;
    }
  }
}

// the picker's search and the slash menu's filter: every word has to be in the name or the line
export const matchesSearch = (words: string[], name: string, line: string) =>
  hasAll(words, `${name} ${line}`.toLowerCase());

const TIERS: ((s: string, w: string) => boolean)[] = [
  (s, w) => s === w,
  (s, w) => s.startsWith(w),
  (s, w) => s.includes(w),
];
const nameOf = (e: TemplateEntry) => e.name;
// a saved template's key is a random id, which nobody types
const keyOf = (e: TemplateEntry) => (e.kind === 'mine' ? '' : e.key);

// Names are tried before keys. The first of exact, starts with and contains that finds anything gives its finds: one
// runs, several are asked about.
function matchTemplates(entries: TemplateEntry[], word: string): TemplateEntry[] {
  const w = word.trim().toLowerCase();
  for (const read of [nameOf, keyOf])
    for (const tier of TIERS) {
      const hit = entries.filter(e => tier(read(e).toLowerCase(), w));
      if (hit.length) return hit;
    }
  return [];
}

// how many letters have to change to turn one word into the other
function distance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row.push(
        Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)),
      );
    prev = row;
  }
  return prev[b.length] ?? 0;
}

// names a typo or two away from what was typed, nearest first
function closeNames(entries: TemplateEntry[], word: string): TemplateEntry[] {
  const w = word.trim().toLowerCase(),
    limit = Math.max(1, Math.floor(w.length / 3)),
    away = (e: TemplateEntry) =>
      Math.min(...[e.name, ...e.name.split(/\s+/), keyOf(e)].filter(Boolean).map(s => distance(s.toLowerCase(), w)));
  return entries
    .map(e => ({ e, d: away(e) }))
    .filter(x => x.d <= limit)
    .sort((a, b) => a.d - b.d)
    .map(x => x.e);
}

const openPicker = () => {
  if (!$('tplPick').classList.contains('on')) clickIn($('tools'), '[data-add="tpl"]');
};

// A click in the picker opens a board without a word, and so does this, so she says it. A template added to this board
// already has its own line from placeFramework or useTemplate.
async function addTemplate(e: TemplateEntry) {
  await runTemplate(e);
  if (e.opens === 'new' && e.kind !== 'prototype') reply(`I opened a new ${e.name} ✦`);
}

export function slashTemplate(arg: string) {
  const word = arg.trim(),
    entries = templateEntries(),
    picker: SayAction = { label: 'Open the template picker', run: openPicker },
    button = (e: TemplateEntry): SayAction => ({ label: e.name, run: () => addTemplate(e) });
  if (!word) return reply('Say which one after /template, such as /template kanban ✦', 0, [picker]);
  const hit = matchTemplates(entries, word),
    [only] = hit;
  if (only && hit.length === 1) return void addTemplate(only);
  if (hit.length) return reply('Which one? ✦', 0, hit.slice(0, 5).map(button));
  reply(`I don’t have a template called “${word}” ✦`, 0, [
    ...closeNames(entries, word).slice(0, 3).map(button),
    picker,
  ]);
}
