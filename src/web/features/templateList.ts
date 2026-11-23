import type { Template } from '../../shared/ops.ts';
import { fit } from '../canvas/handles.ts';
import { FRAMEWORKS } from '../content/frameworks.ts';
import { placeFramework, STARTERS } from '../content/placeFramework.ts';
import { session } from '../core/state.ts';
import { openBoard } from '../library/openBoard.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { foldersIn } from '../library/tree.ts';
import { newBoard, TEMPLATES } from '../model/boards.ts';
import { startPrototypeHere } from '../repo/start.ts';
import { scope } from '../ui/toolbar.ts';
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

// what a click in the picker does, for each kind
export async function runTemplate(entry: TemplateEntry): Promise<void> {
  switch (entry.kind) {
    case 'prototype':
      return startPrototypeHere();
    case 'framework':
      return placeFramework(entry.key);
    case 'starter': {
      const b = newBoard(entry.name, entry.name),
        { f, p } = scope(),
        into = f || (p && foldersIn(p.id)[0]);
      if (into) b.folder = into.id;
      await Fenmyr.save(b);
      await openBoard(b.id);
      fit(session.board.cards);
      refreshBoards();
      return;
    }
    case 'mine': {
      const t = myTpls.find(x => x.id === entry.key);
      if (t) await useTemplate(t);
      return;
    }
    default: {
      const unhandled: never = entry.kind;
      return unhandled;
    }
  }
}
