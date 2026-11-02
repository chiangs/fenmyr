import { cardEl, esc } from '../ui/dom.ts';
import { byId, renderWires } from '../canvas/wires.ts';
import { CGAP, CHEAD, CPAD, CW, KHEAD, colls, layoutColl, parentOf } from './collection.ts';
import { clamp } from '../core/base.ts';
import { cardsEl } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { editField } from '../edit/text.ts';
import { boardMenu } from '../features/export.ts';
import { session } from '../core/state.ts';
import type { CardOf } from '../../shared/model.ts';
import type { MenuItem } from '../features/export.ts';

type Coll = CardOf<'coll'>;
const when = (on: boolean, items: MenuItem[]) => (on ? items : []);
type Point = { x: number; y: number };
// a kanban's column facts, made if they're missing (an older board, or a plain collection turned into one)
const columns = (s: Coll) => ({
  names: (s.colNames ??= []),
  limits: (s.colLimit ??= []),
  colOf: (s.colOf ??= {}),
});

// ---------- kanban: a collection whose columns have names, counts and (optionally) a limit ----------
export function drawKanban(s: Coll, el: HTMLElement) {
  if (el.querySelector('.kb-h .text[contenteditable="true"]')) return; // typing a column name: leave the box alone, or it loses focus after each letter
  const body = el.querySelector('.body');
  const host =
      el.querySelector('.kb-heads') ||
      body?.appendChild(Object.assign(document.createElement('div'), { className: 'kb-heads' })),
    top = s.head === false ? 0 : CHEAD,
    { names, limits, colOf } = columns(s);
  if (!host) return;
  host.innerHTML = names
    .map((nm, k) => {
      const n = s.kids.filter(id => colOf[id] === k).length,
        lim = limits[k] || 0,
        left = CPAD + k * (CW + CGAP),
        laneLeft = left - 6,
        laneTop = top + KHEAD - 4,
        laneW = CW + 12,
        headTop = top + 4,
        over = lim && n > lim ? ' over' : '',
        name = esc(nm),
        count = lim ? `${n} of ${lim} allowed` : `${n} card${n === 1 ? '' : 's'}`,
        shown = lim ? `${n} / ${lim}` : String(n);
      return `<i class="kb-lane" style="left:${laneLeft}px;top:${laneTop}px;width:${laneW}px;bottom:8px"></i><div class="kb-h${over}" data-k="${k}" style="left:${left}px;top:${headTop}px;width:${CW}px"><span class="text">${name}</span><b class="kb-n" title="${count}">${shown}</b></div>`;
    })
    .join('');
}

function kanbanOp(s: Coll, fn: () => void) {
  remember();
  fn();
  layoutColl(s);
  renderWires();
  save();
}

// start typing a column's name (a new column comes up like this, with 'New column' selected)
function renameKanbanCol(s: Coll, k: number, undoStep = true) {
  const el = cardEl(s.id),
    t = el?.querySelector(`.kb-h[data-k="${k}"] .text`),
    { names } = columns(s);
  if (el && t instanceof HTMLElement) {
    if (undoStep) remember();
    editField(
      el,
      t,
      v => {
        names[k] = v;
      },
      () => {
        names[k] = names[k] || 'Column ' + (k + 1);
        layoutColl(s);
        save();
      },
    );
  }
}

export function kanbanMenu(e: MouseEvent, s: Coll, k: number) {
  const cols = s.cols ?? 1,
    last = cols - 1,
    { names, limits, colOf } = columns(s),
    move = (d: number) =>
      kanbanOp(s, () => {
        const j = k + d,
          swap = <T>(a: T[]) => {
            const x = a[k],
              y = a[j];
            if (x === undefined || y === undefined) return;
            a[k] = y;
            a[j] = x;
          };
        swap(names);
        swap(limits);
        for (const id of Object.keys(colOf)) {
          if (colOf[id] === k) colOf[id] = j;
          else if (colOf[id] === j) colOf[id] = k;
        }
      });
  const items: MenuItem[] = [
    { label: 'Rename column', run: () => renameKanbanCol(s, k) },
    ...when(k > 0, [{ label: 'Move left', run: () => move(-1) }]),
    ...when(k < last, [{ label: 'Move right', run: () => move(1) }]),
    {
      label: 'Add a column after',
      run: () =>
        kanbanOp(s, () => {
          s.cols = cols + 1;
          names.splice(k + 1, 0, 'New column');
          limits.splice(k + 1, 0, 0);
          for (const [id, at] of Object.entries(colOf)) if (at > k) colOf[id] = at + 1;
          setTimeout(() => renameKanbanCol(s, k + 1, false), 0);
        }),
    },
    '-',
    ...[0, 1, 2, 3, 5, 8].map(n => {
      const name = n ? `Limit ${n}` : 'No limit';
      return {
        label: (limits[k] || 0) === n ? `✓ ${name}` : name,
        run: () =>
          kanbanOp(s, () => {
            limits[k] = n;
          }),
      };
    }),
    ...when(cols > 1, [
      '-',
      {
        label: 'Delete column',
        danger: true,
        run: () =>
          kanbanOp(s, () => {
            const into = k > 0 ? k - 1 : 1; // its cards move to the neighbour
            for (const id of Object.keys(colOf)) if (colOf[id] === k) colOf[id] = into;
            for (const [id, at] of Object.entries(colOf)) if (at > k) colOf[id] = at - 1;
            names.splice(k, 1);
            limits.splice(k, 1);
            s.cols = cols - 1;
          }),
      },
    ]),
  ];
  boardMenu(e, items);
}

export function layoutAll() {
  if (!session.board) return;
  colls().forEach(layoutColl);
  for (const el of cardsEl.querySelectorAll('.card.inside'))
    if (el instanceof HTMLElement && !parentOf(el.dataset.id ?? '')) el.classList.remove('inside');
}

// which collection is under a point (or just to its right: dropping there adds a column)
export function collAt(w: Point, skip: Set<string>) {
  for (const s of [...colls()].reverse()) {
    if (skip.has(s.id)) continue;
    if (w.y > s.y && w.y < s.y + s.h + 70) {
      if (w.x > s.x && w.x < s.x + s.w) return { s, side: false };
      if (w.y < s.y + s.h && w.x >= s.x + s.w && w.x < s.x + s.w + 70) return { s, side: true };
    }
  } // a little below the frame adds to the end
  return null;
}

export function dropInto(t: { s: Coll; side: boolean }, ids: string[], w: Point) {
  ids.forEach(id => {
    const from = parentOf(id);
    if (from) {
      from.kids = from.kids.filter(k => k !== id);
      if (from.colOf) delete from.colOf[id];
    }
  });
  const s = t.s,
    { colOf } = columns(s);
  let col: number;
  if (t.side) {
    s.cols = (s.cols || 1) + 1;
    col = s.cols - 1;
  } else col = clamp(Math.floor((w.x - s.x - CPAD) / (CW + CGAP)), 0, (s.cols || 1) - 1);
  // within that column, slot it after the cards that sit above where you let go
  const inCol = s.kids.filter(k => colOf[k] === col),
    above = inCol.filter(k => {
      const c = byId(k);
      return c && c.y + c.h / 2 < w.y;
    });
  const lastAbove = above.at(-1),
    firstIn = inCol[0];
  const at = lastAbove ? s.kids.indexOf(lastAbove) + 1 : firstIn ? s.kids.indexOf(firstIn) : s.kids.length;
  s.kids.splice(at, 0, ...ids);
  for (const id of ids) colOf[id] = col;
}
