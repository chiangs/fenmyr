// The "Workshop planning" starter board: the phases of a workshop (Define, Design, Prepare, Run, Follow up) side by side, each in a labelled section,
// with the risks, optional modules and version log underneath. The words live in workshopData.ts and workshopMore.ts; this places them.
import type { Card } from '../../shared/model.ts';
import type { card as makeCard } from '../model/boards.ts';
import { EARLY_PHASES, FOOTER, type Group, HOW_TO, type Note, type Phase, SNAPSHOT } from './workshopData.ts';
import { COMPLIANCE, LATE_PHASES, MODULES, RISKS, VERSION_LOG } from './workshopMore.ts';

type Make = typeof makeCard;

const UNIT = 300; // one column of a section: a collection is 288 wide, a checklist 240
const GAP = 36; // between stacked groups
const SEC_PAD = 36;
const SEC_TOP = 58;
const FIRST_ROW = 440;
const CELL = 4 * UNIT + 100; // where each section of a row starts
const ROW_GAP = 130;

// How tall cards come out, to stack groups without overlapping. A guess: collections grow to fit what they hold.
const lines = (t: string, per: number) => t.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / per)), 0);
const noteH = (n: Note) => 48 + 24 * lines(n.name, 26) + (n.text ? 10 + 22 * lines(n.text, 29) : 24);
// a checklist card does not grow with its items, so it is given the height they need
const todoH = (g: { text: string; items: string[] }) =>
  76 + 22 * lines(g.text, 22) + g.items.reduce((n, t) => n + 18 * lines(t, 21) + 6, 0);
const stackH = (notes: Note[]) => notes.reduce((n, k) => n + noteH(k) + 12, 0);
const groupH = (g: Group): number => {
  switch (g.k) {
    case 'coll': {
      // two columns fill the shorter one first
      let left = 0,
        right = 0;
      for (const n of g.notes) {
        if (g.span === 2 && right < left) right += noteH(n) + 12;
        else left += noteH(n) + 12;
      }
      return 80 + Math.max(left, right);
    }
    case 'kanban':
      return 170 + Math.max(...g.cols.map(c => stackH(c.notes ?? [])), 200);
    case 'todo':
      return todoH(g);
    case 'note':
      return 70 + 22 * lines(g.text, 29) + 24 * lines(g.name, 26);
  }
};
const spanOf = (g: Group) => (g.k === 'kanban' ? g.span : g.k === 'coll' ? (g.span ?? 1) : 1);

export function workshopPlanning(card: Make) {
  const tray: Card[] = [];
  const frames: Card[] = [],
    cards: Card[] = [];
  const notesIn = (notes: Note[], color: string) =>
    notes.map(n => card('note', { name: n.name, text: n.text ?? '', color, r: 0 }));
  // one group of cards at (x, y); the collections and kanbans fill themselves when they are drawn
  const build = (g: Group, x: number, y: number, color: string): Card[] => {
    switch (g.k) {
      case 'todo':
        return [
          card('todo', {
            x,
            y,
            w: 240,
            h: todoH(g),
            text: g.text,
            items: g.items.map(t => ({ t, done: false })),
            r: 0,
          }),
        ];
      case 'note':
        return [card('note', { x, y, w: 260, h: groupH(g), name: g.name, text: g.text, rich: g.rich, color, r: 0 })];
      case 'coll': {
        const kids = notesIn(g.notes, color);
        return [
          card('coll', { x, y, text: g.name, color, kids: kids.map(k => k.id), cols: g.span === 2 ? 2 : 1, r: 0 }),
          ...kids,
        ];
      }
      case 'kanban': {
        const lanes = g.cols.map(c => notesIn(c.notes ?? [], color)),
          kids = lanes.flat(),
          colOf: Record<string, number> = {};
        lanes.forEach((ks, i) => {
          ks.forEach(k => {
            colOf[k.id] = i;
          });
        });
        return [
          card('coll', {
            x,
            y,
            text: g.name,
            color,
            kanban: true,
            kids: kids.map(k => k.id),
            colOf,
            cols: g.cols.length,
            colNames: g.cols.map(c => c.name),
            colLimit: g.cols.map(() => 0),
            r: 0,
          }),
          ...kids,
        ];
      }
    }
  };
  // a phase: its groups stack down their columns (a wide group sits under all the columns it covers) inside a labelled section
  const section = (ph: Phase, px: number, py: number) => {
    const bottoms: number[] = Array(ph.cols).fill(0);
    for (const g of ph.groups) {
      const span = spanOf(g),
        at = Math.min(g.col, ph.cols - span),
        y = Math.max(...bottoms.slice(at, at + span));
      cards.push(...build(g, px + at * UNIT, py + y, ph.color));
      for (let i = at; i < at + span; i++) bottoms[i] = y + groupH(g) + GAP;
    }
    const bottom = Math.max(...bottoms) - GAP;
    frames.push(
      card('section', {
        x: px - SEC_PAD,
        y: py - SEC_TOP,
        w: ph.cols * UNIT - 12 + SEC_PAD * 2,
        h: bottom + SEC_TOP + SEC_PAD,
        r: 0,
        text: ph.title,
        color: ph.color,
      }),
    );
    return py + bottom + SEC_PAD;
  };

  const top = [
    card('title', { x: 0, y: -60, text: 'Workshop planning' }),
    card('note', {
      x: 0,
      y: 30,
      w: 300,
      h: 340,
      r: 1.5,
      name: 'Myra’s how-to',
      text: HOW_TO,
      color: 'white',
      myra: true,
    }),
    card('note', {
      x: 340,
      y: 30,
      w: 360,
      h: 330,
      name: SNAPSHOT.name,
      text: SNAPSHOT.text ?? '',
      color: 'butter',
      r: 0,
    }),
  ];
  // three rows of three sections: the early phases, the later ones, and the closing row (risks, optional modules, lessons)
  const closing: Phase[] = [
    { title: 'Risks, dependencies and compliance', color: 'pink', cols: 4, groups: [RISKS, COMPLIANCE] },
    {
      title: 'Optional modules (keep only what applies)',
      color: 'white',
      cols: 4,
      groups: MODULES.map((m, i): Group => ({ k: 'todo', text: m.text, items: m.items, col: i })),
    },
    {
      title: 'Lessons learned',
      color: 'white',
      cols: 1,
      groups: [
        { k: 'note', name: VERSION_LOG.name, text: VERSION_LOG.text ?? '', col: 0 },
        { k: 'note', name: 'Before you share it', text: FOOTER, col: 0 },
      ],
    },
  ];
  let y = FIRST_ROW;
  for (const phases of [EARLY_PHASES, LATE_PHASES, closing]) {
    y = Math.max(...phases.map((ph, i) => section(ph, i * CELL, y))) + ROW_GAP;
  }
  return { cards: [...frames, ...top, ...cards], tray };
}
