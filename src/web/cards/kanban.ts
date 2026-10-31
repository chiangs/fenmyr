// @ts-nocheck
import { cardEl, esc } from '../ui/dom.ts';
import { byId, renderWires } from '../canvas/wires.ts';
import { CGAP, CHEAD, CPAD, CW, KHEAD, colls, layoutColl, parentOf } from './collection.ts';
import { clamp } from '../core/base.ts';
import { cardsEl } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { editField } from '../edit/text.ts';
import { boardMenu } from '../features/export.ts';
import { session } from '../core/state.ts';

// ---------- kanban: a collection whose columns have names, counts and (optionally) a limit ----------
export function drawKanban(s, el) {
  if (el.querySelector('.kb-h .text[contenteditable="true"]')) return; // typing a column name: leave the box alone, or it loses focus after each letter
  const host =
      el.querySelector('.kb-heads') ||
      el.querySelector('.body').appendChild(Object.assign(document.createElement('div'), { className: 'kb-heads' })),
    top = s.head === false ? 0 : CHEAD;
  host.innerHTML = s.colNames
    .map((nm, k) => {
      const n = (s.kids || []).filter(id => s.colOf?.[id] === k).length,
        lim = s.colLimit[k] || 0,
        left = CPAD + k * (CW + CGAP);
      return `<i class="kb-lane" style="left:${left - 6}px;top:${top + KHEAD - 4}px;width:${CW + 12}px;bottom:8px"></i><div class="kb-h${lim && n > lim ? ' over' : ''}" data-k="${k}" style="left:${left}px;top:${top + 4}px;width:${CW}px"><span class="text">${esc(nm)}</span><b class="kb-n" title="${lim ? `${n} of ${lim} allowed` : `${n} card${n === 1 ? '' : 's'}`}">${n}${lim ? ' / ' + lim : ''}</b></div>`;
    })
    .join('');
}

function kanbanOp(s, fn) {
  remember();
  fn();
  layoutColl(s);
  renderWires();
  save();
}

// start typing a column's name (a new column comes up like this, with 'New column' selected)
function renameKanbanCol(s, k, undoStep = true) {
  const el = cardEl(s.id),
    t = el?.querySelector(`.kb-h[data-k="${k}"] .text`);
  if (t) {
    if (undoStep) remember();
    editField(
      el,
      t,
      v => (s.colNames[k] = v),
      () => {
        s.colNames[k] = s.colNames[k] || 'Column ' + (k + 1);
        layoutColl(s);
        save();
      },
    );
  }
}

export function kanbanMenu(e, s, k) {
  const last = s.cols - 1,
    move = d =>
      kanbanOp(s, () => {
        const j = k + d,
          swap = a => {
            [a[k], a[j]] = [a[j], a[k]];
          };
        swap(s.colNames);
        swap(s.colLimit);
        Object.keys(s.colOf || {}).forEach(id => {
          if (s.colOf[id] === k) s.colOf[id] = j;
          else if (s.colOf[id] === j) s.colOf[id] = k;
        });
      });
  boardMenu(e, [
    { label: 'Rename column', run: () => renameKanbanCol(s, k) },
    ...(k > 0 ? [{ label: 'Move left', run: () => move(-1) }] : []),
    ...(k < last ? [{ label: 'Move right', run: () => move(1) }] : []),
    {
      label: 'Add a column after',
      run: () =>
        kanbanOp(s, () => {
          s.cols++;
          s.colNames.splice(k + 1, 0, 'New column');
          s.colLimit.splice(k + 1, 0, 0);
          Object.keys(s.colOf || {}).forEach(id => {
            if (s.colOf[id] > k) s.colOf[id]++;
          });
          setTimeout(() => renameKanbanCol(s, k + 1, false), 0);
        }),
    },
    '-',
    ...[0, 1, 2, 3, 5, 8].map(n => ({
      label: (s.colLimit[k] || 0) === n ? `✓ ${n ? 'Limit ' + n : 'No limit'}` : n ? `Limit ${n}` : 'No limit',
      run: () => kanbanOp(s, () => (s.colLimit[k] = n)),
    })),
    ...(s.cols > 1
      ? [
          '-',
          {
            label: 'Delete column',
            danger: true,
            run: () =>
              kanbanOp(s, () => {
                const into = k > 0 ? k - 1 : 1; // its cards move to the neighbour
                Object.keys(s.colOf || {}).forEach(id => {
                  if (s.colOf[id] === k) s.colOf[id] = into;
                });
                Object.keys(s.colOf || {}).forEach(id => {
                  if (s.colOf[id] > k) s.colOf[id]--;
                });
                s.colNames.splice(k, 1);
                s.colLimit.splice(k, 1);
                s.cols--;
              }),
          },
        ]
      : []),
  ]);
}

export function layoutAll() {
  if (!session.board) return;
  colls().forEach(layoutColl);
  cardsEl.querySelectorAll('.card.inside').forEach(el => {
    if (!parentOf(el.dataset.id)) el.classList.remove('inside');
  });
}

// which collection is under a point (or just to its right: dropping there adds a column)
export function collAt(w, skip) {
  for (const s of [...colls()].reverse()) {
    if (skip.has(s.id)) continue;
    if (w.y > s.y && w.y < s.y + s.h + 70) {
      if (w.x > s.x && w.x < s.x + s.w) return { s, side: false };
      if (w.y < s.y + s.h && w.x >= s.x + s.w && w.x < s.x + s.w + 70) return { s, side: true };
    }
  } // a little below the frame adds to the end
  return null;
}

export function dropInto(t, ids, w) {
  ids.forEach(id => {
    const from = parentOf(id);
    if (from) {
      from.kids = from.kids.filter(k => k !== id);
      if (from.colOf) delete from.colOf[id];
    }
  });
  const s = t.s;
  s.kids = s.kids || [];
  s.colOf = s.colOf || {};
  let col;
  if (t.side) {
    s.cols = (s.cols || 1) + 1;
    col = s.cols - 1;
  } else col = clamp(Math.floor((w.x - s.x - CPAD) / (CW + CGAP)), 0, (s.cols || 1) - 1);
  // within that column, slot it after the cards that sit above where you let go
  const inCol = s.kids.filter(k => s.colOf[k] === col),
    above = inCol.filter(k => {
      const c = byId(k);
      return c && c.y + c.h / 2 < w.y;
    });
  const at = above.length
    ? s.kids.indexOf(above[above.length - 1]) + 1
    : inCol.length
      ? s.kids.indexOf(inCol[0])
      : s.kids.length;
  s.kids.splice(at, 0, ...ids);
  ids.forEach(id => (s.colOf[id] = col));
}
