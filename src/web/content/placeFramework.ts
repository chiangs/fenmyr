import { cardEl } from '../ui/dom.ts';
import { placeInView } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { layoutAll } from '../cards/kanban.ts';
import { uid } from '../core/base.ts';
import { remember, save } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { say } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import { stopPlacing } from '../tools/place.ts';
import { session } from '../core/state.ts';
import type { Card } from '../../shared/model.ts';
import { FRAMEWORKS, type FrameworkNote } from './frameworks.ts';

export function placeFramework(key: string) {
  const F = FRAMEWORKS[key];
  if (!F) return;
  remember();
  stopPlacing();
  const made: Card[] = [],
    keyed: Record<string, Card> = {};
  // a collection and the notes inside it, which it lays out itself
  const addCollection = (coll: Card, kids: Card[]) => {
    for (const c of [coll, ...kids]) {
      session.board.cards.push(c);
      renderCard(c, true);
    }
    made.push(coll, ...kids);
  };
  const inside = (n: FrameworkNote) => card('note', { text: n.text, color: n.color || 'white', r: 0 });
  for (const it of F.items) {
    const at = { x: it.x, y: it.y };
    switch (it.t) {
      case 'title':
        made.push(addCard(card('title', { ...at, text: it.text }), true));
        break;
      case 'note': {
        const c = addCard(card('note', { ...at, text: it.text, name: it.name, color: it.color || 'white' }), true);
        made.push(c);
        if (it.key) keyed[it.key] = c;
        break;
      }
      case 'how':
        made.push(
          addCard(
            card('note', {
              ...at,
              w: 280,
              h: 300,
              r: 1.5,
              name: 'Myra’s how-to',
              text: it.text,
              color: 'white',
              myra: true,
            }),
            true,
          ),
        );
        break;
      case 'kanban': {
        const kids: Card[] = [],
          colOf: Record<string, number> = {};
        it.cols.forEach((col, k) => {
          for (const n of col.notes || []) {
            const kid = inside(n);
            kids.push(kid);
            colOf[kid.id] = k;
          }
        });
        const board = card('coll', {
          ...at,
          text: it.name,
          color: it.color || 'white',
          kanban: true,
          kids: kids.map(k => k.id),
          colOf,
          cols: it.cols.length,
          colNames: it.cols.map(c => c.name),
          colLimit: it.cols.map(c => c.limit || 0),
          r: 0,
        });
        addCollection(board, kids);
        break;
      }
      case 'coll': {
        const kids = it.notes.map(inside);
        addCollection(
          card('coll', { ...at, text: it.name, color: it.color, kids: kids.map(k => k.id), cols: 1, r: 0 }),
          kids,
        );
        break;
      }
      default: {
        const unhandled: never = it;
        throw new Error(`unknown framework item ${JSON.stringify(unhandled)}`);
      }
    }
  }
  for (const [a, b] of F.links || []) {
    const from = keyed[a],
      to = keyed[b];
    if (from && to) session.board.links.push({ id: uid(), a: from.id, b: to.id, arrow: true });
  }
  // notes grow to fit their words
  made
    .filter(c => c.type === 'note' && !parentOf(c.id))
    .forEach(c => {
      const el = cardEl(c.id),
        b = el?.querySelector('.body');
      if (!el || !(b instanceof HTMLElement)) return;
      b.style.height = 'auto';
      c.h = Math.max(c.h, b.offsetHeight + 8);
      b.style.height = '';
      el.style.height = c.h + 'px';
    });
  layoutAll();
  placeInView(made);
  renderWires();
  save();
  say(
    `Here’s ${/^[aeiou]/i.test(F.name) ? 'an' : 'a'} ${F.name.toLowerCase()} ${F.emoji} My how-to note is on the right. Delete it whenever you’re ready ✦`,
    7000,
  );
}

// little line icons for the menu, drawn like the toolbar's
export const TPL_IC: Record<string, string> = {
  affinity: 'tpl-affinity',
  opportunity: 'tpl-opportunity',
  matrix: 'tpl-matrix',
  empathy: 'tpl-empathy',
  journey: 'tpl-journey',
  hmw: 'tpl-hmw',
  kanban: 'tpl-kanban',
  retro: 'tpl-retro',
};

// the old "Start from" boards live here now too, under the frameworks: each opens as its own new board
// name → its line in the picker and its icon
export const STARTERS: Record<string, [line: string, icon: string]> = {
  Moodboard: ['Pictures, colours and fonts for a feeling', 'palette'],
  'Brain dump': ['Empty your head, then I’ll sort it', 'brain'],
  'OKRs and opportunities': ['A vision, its key results and an opportunity tree', 'tree'],
  'Product kickoff': ['Why, who for, the edges and the first steps', 'rocket'],
  'App plan': ["Who it's for, the problem, the screens", 'screen'],
  'Workshop planning': ['Define, design, prepare, run and follow up a workshop', 'users'],
};
