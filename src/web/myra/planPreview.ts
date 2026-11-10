// While one of Myra's plans waits, the board shows what Do it would land: a dashed box where each card it adds, moves
// or changes would end up, and a "Removed" box over each card it takes away. The boxes come from the landing Do it
// makes, laid out as the board lays out cards once they land, so after Do it each card sits where its box was. The layer
// is in #world, outside #cards, with no .card or data-id and no pointer, so nothing takes a box for a card. It is never
// saved, and an export hides it.
import { cardName } from '../../shared/cardTypes.ts';
import { type BoardLists, copy, holdersOf } from '../../shared/changes.ts';
import type { Card } from '../../shared/model.ts';
import { boxOf } from '../canvas/emptySpot.ts';
import type { Bounds } from '../canvas/handles.ts';
import { paintCard } from '../canvas/render.ts';
import { arrange, CW, naturalHeight } from '../cards/collection.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { cardEl } from '../ui/dom.ts';
import { waitingNow } from './heldPlan.ts';

type Now = NonNullable<ReturnType<typeof waitingNow>>;
type Kind = 'add' | 'move' | 'edit' | 'remove';
type Box = Bounds & { id: string; kind: Kind; label: string };

const HEAD = 'Preview · not on the board yet';

// what the layer shows: the landing its boxes come from; '' when it is empty
let drawn = '';
// what the layer last drew, so a save that leaves every box as it was redraws nothing on the board
let painted = '';
// the heights of the cards the plan changes, measured once each, since the plan's copies don't change while it waits
let measured: { plan: string; h: Map<string, number> } = { plan: '', h: new Map() };

// Every frame. Without a plan waiting, it returns at once.
export function drawPlanPreview() {
  const now = waitingNow();
  if (!now) {
    if (drawn) clear();
    return;
  }
  if (now.key === drawn) return;
  drawn = now.key;
  if (measured.plan !== now.id) measured = { plan: now.id, h: new Map() };
  const { list, head } = boxesOf(now);
  paint(list, head);
}

function clear() {
  const layer = $('planPreview');
  layer.replaceChildren();
  drawn = '';
  painted = '';
}

// One box for each card a step covers, except a screen's pieces, which go with their screen.
function boxesOf({ planned: { record, changes }, parts, land }: Now) {
  const touched = new Set(record.cards.map(d => d.id)),
    removed = new Set(changes.removed),
    added = new Set(changes.added),
    moved = new Set(changes.moved),
    laid = laidOut(land.lists),
    before = new Map(session.board.cards.map(c => [c.id, c])),
    list = parts.flatMap(cards =>
      cards.flatMap((id): Box[] => {
        const gone = removed.has(id),
          c = (gone ? before : laid).get(id);
        if (!c || (c.onFrame && touched.has(c.onFrame))) return [];
        const kind = gone ? 'remove' : added.has(id) ? 'add' : moved.has(id) ? 'move' : 'edit';
        return [{ id, kind, x: c.x, y: c.y, w: c.w, h: c.h, label: gone ? 'Removed' : cardName(c) }];
      }),
    ),
    holders = holdersOf(land.lists.cards),
    corners = list.map(b => laid.get(holders.get(b.id) ?? '') ?? b);
  return { list, head: corners.length ? boxOf(corners) : null };
}

// The board's cards once the plan lands, each where it ends up. Landing lays out every collection again, measuring the
// cards drawn anew, so a collection holding a card the plan changes is laid out here the same way, on copies, since
// the landing shares the board's own card objects.
function laidOut(lists: BoardLists) {
  const board = new Map(session.board.cards.map(c => [c.id, c])),
    out = new Map(lists.cards.map(c => [c.id, c])),
    fresh = (c: Card | undefined) => !!c && board.get(c.id) !== c;
  for (const s of lists.cards) {
    if (s.type !== 'coll' || !(fresh(s) || s.kids.some(id => fresh(out.get(id))))) continue;
    const kids = s.kids.flatMap(id => out.get(id) ?? []),
      heights = new Map(kids.map(k => [k.id, heightOf(k, fresh(k))])),
      coll = copy(s),
      copies = kids.map(copy);
    arrange(coll, copies, k => heights.get(k.id) ?? k.h);
    for (const c of [coll, ...copies]) out.set(c.id, c);
  }
  return out;
}

// Each card as tall as landing will measure it: a card the plan doesn't change, from how it is drawn now; a note or a
// to-do list it changes, by drawing the plan's copy aside, once, since that copy doesn't change while the plan waits.
function heightOf(c: Card, fresh: boolean) {
  const el = fresh ? null : cardEl(c.id);
  if (el) return naturalHeight(c, el);
  if (c.type === 'image') return Math.round(CW * (c.h / c.w));
  if (c.type !== 'note' && c.type !== 'todo') return c.h;
  const key = `${c.id}|${c.w}`,
    known = measured.h.get(key);
  if (known !== undefined) return known;
  const aside = $('planPreview').appendChild(document.createElement('div'));
  paintCard(aside, c);
  aside.classList.add('inside');
  const h = naturalHeight(c, aside);
  aside.remove();
  measured.h.set(key, h);
  return h;
}

function paint(list: readonly Box[], at: Bounds | null) {
  const sig = JSON.stringify([list, at]);
  if (sig === painted) return;
  painted = sig;
  const layer = $('planPreview'),
    els = list.map(b => {
      const el = document.createElement('div');
      el.className = `pp-box ${b.kind}`;
      el.dataset.pp = b.id;
      Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
      el.appendChild(document.createElement('span')).textContent = b.label;
      return el;
    });
  if (!at) return layer.replaceChildren(...els);
  const head = document.createElement('div');
  head.className = 'pp-head';
  head.textContent = HEAD;
  head.style.left = `${at.x}px`;
  head.style.top = `${at.y}px`;
  layer.replaceChildren(...els, head);
}
