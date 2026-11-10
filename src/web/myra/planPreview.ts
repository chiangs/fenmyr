// While one of Myra's plans waits, the board shows what Do it would land: a dashed box where each card it adds, moves
// or changes would end up, a "Removed" box over each card it takes away, and a quieter box where each card no step
// names would go when its collection is laid out again, the collection's own frame included. The boxes come from the
// landing Do it makes, laid out as the board lays out cards once they land, so after Do it every card whose place or
// size changed sits where its box was. The layer is in #world, outside #cards, with no .card or data-id and no
// pointer, so nothing takes a box for a card. It is never saved, and no picture of the window shows it (hostCall.ts).
import { cardName } from '../../shared/cardTypes.ts';
import { type BoardLists, copy, holdersOf } from '../../shared/changes.ts';
import type { Card } from '../../shared/model.ts';
import type { Bounds } from '../canvas/handles.ts';
import { paintCard } from '../canvas/render.ts';
import { arrange, CW, laidMarked, layoutCount, naturalHeight } from '../cards/collection.ts';
import { $, stage } from '../core/dom.ts';
import { bringIntoView } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { cardEl, isTyping, textField } from '../ui/dom.ts';
import { waitingNow } from './heldPlan.ts';

type Now = NonNullable<ReturnType<typeof waitingNow>>;
// laid: a card no step names, which Do it moves or resizes only by laying out its collection again
type Kind = 'add' | 'move' | 'edit' | 'remove' | 'laid';
// steps: the plan's steps whose change puts it there, any of which lights it while the pointer is on that step
type Box = Bounds & { id: string; kind: Kind; steps: number[]; label: string };

const HEAD = 'Preview · not on the board yet';

// what the layer shows: the landing its boxes come from, and the lit step; '' when it is empty
let drawn = '';
// head: the box whose top edge the preview's name sits on, by its place in the list
let boxes: { key: string; list: Box[]; head: number } = { key: '', list: [], head: -1 };
// The plan the view glides to once they aren't busy, and the view as it was when the plan arrived. from is null once
// it has glided, or once they moved the view themselves, since they chose where to look.
let glide: { plan: string; from: string | null } = { plan: '', from: null };
// what the layer last drew, so a save that leaves every box as it was redraws nothing on the board
let painted = '';
// the heights of the cards the plan changes, measured once each, since the plan's copies don't change while it waits
let measured: { plan: string; h: Map<string, number> } = { plan: '', h: new Map() };
// The cards selected or typed in, which a note shows its empty name in, so it is drawn taller. Do it lays the board out
// as it looks then, so a card whose look changed since its collection was last laid out is measured again.
const marks = () => `${session.editing}|${[...session.sel].join()}`;
const marked = (id: string) => session.sel.has(id) || session.editing === id;

// Every frame. Without a plan waiting, it returns at once.
export function drawPlanPreview() {
  const now = waitingNow();
  if (!now) {
    if (drawn) clear();
    return;
  }
  const boxKey = `${now.key}|${layoutCount()}|${marks()}`,
    key = `${boxKey}|${now.hot}`;
  if (key !== drawn) {
    drawn = key;
    if (measured.plan !== now.id) measured = { plan: now.id, h: new Map() };
    if (boxes.key !== boxKey) boxes = { key: boxKey, ...boxesOf(now) };
    paint(boxes.list, boxes.head, now.hot);
  }
  glideTo(now.id, boxes.list);
}

function clear() {
  const layer = $('planPreview');
  layer.replaceChildren();
  layer.classList.remove('lit');
  drawn = '';
  painted = '';
}

const viewNow = () => `${session.view.x}|${session.view.y}|${session.view.z}`;

// Once for each plan, on the first frame they aren't busy, unless they moved the view after it arrived.
function glideTo(plan: string, list: readonly Box[]) {
  if (glide.plan !== plan) glide = { plan, from: viewNow() };
  if (glide.from === null || !list.length) return;
  if (glide.from !== viewNow()) glide.from = null;
  else if (!busy()) {
    glide.from = null;
    bringIntoView(list);
  }
}

// They are dragging, moving the view with the wheel or a pinch, or typing in a card or a doc. Words in Myra's input
// don't count: a glide moves only the board, and people often write their next message while she thinks.
function busy() {
  const active = document.activeElement;
  return (
    !!appState.drag ||
    stage.classList.contains('moving') ||
    !!session.editing ||
    (active !== textField('mcInput') && isTyping(active))
  );
}

const sameRect = (a: Bounds, b: Bounds) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const rectOf = ({ x, y, w, h }: Bounds) => ({ x, y, w, h });

// One box for each card a step covers, except a card they changed since, which she leaves, and a screen's pieces,
// which go with their screen; then a quieter one for each other card Do it would move or resize.
function boxesOf({ planned: { record, changes }, parts, land, left }: Now) {
  const touched = new Set(record.cards.map(d => d.id)),
    removed = new Set(changes.removed),
    added = new Set(changes.added),
    moved = new Set(changes.moved),
    { cards: laid, again } = laidOut(land.lists),
    before = new Map(session.board.cards.map(c => [c.id, c])),
    lit = lightsOf(parts, land.lists),
    own = (c: Card) => !(c.onFrame && touched.has(c.onFrame)),
    named = parts.flatMap(cards =>
      cards.flatMap((id): Box[] => {
        const gone = removed.has(id),
          c = (gone ? before : laid).get(id);
        if (!c || left.has(id) || !own(c)) return [];
        const kind = gone ? 'remove' : added.has(id) ? 'add' : moved.has(id) ? 'move' : 'edit';
        return [{ id, kind, steps: lit(id), ...rectOf(c), label: gone ? 'Removed' : cardName(c) }];
      }),
    ),
    boxed = new Set(named.map(b => b.id)),
    shifted = again.flatMap((c): Box[] => {
      const was = before.get(c.id);
      if (!was || boxed.has(c.id) || !own(c) || sameRect(was, c)) return [];
      return [{ id: c.id, kind: 'laid', steps: lit(c.id), ...rectOf(c), label: '' }];
    }),
    list = [...named, ...shifted],
    first = firstOf(named) ?? firstOf(shifted);
  return { list, head: first ? list.indexOf(first) : -1 };
}

// the box nearest the top, then the left, which reads first
const firstOf = (bs: readonly Box[]) =>
  bs.reduce<Box | null>((a, b) => (!a || b.y < a.y || (b.y === a.y && b.x < a.x) ? b : a), null);

// The steps that light each card: its own, and every step whose cards go into, come out of or change inside the
// collection it lands in, or inside it when it is a collection, since that step's change lays it out again.
function lightsOf(parts: readonly string[][], lists: BoardLists) {
  const after = holdersOf(lists.cards),
    now = holdersOf(session.board.cards),
    lays = new Map<string, Set<number>>();
  parts.forEach((cards, step) => {
    for (const id of cards)
      for (const at of [id, after.get(id), now.get(id)]) if (at) lays.set(at, (lays.get(at) ?? new Set()).add(step));
  });
  return (id: string) => [...new Set([...(lays.get(id) ?? []), ...(lays.get(after.get(id) ?? '') ?? [])])];
}

// The board's cards once the plan lands, each where it ends up, and the cards laid out again on the way. Landing lays
// out every collection again, measuring the cards drawn anew, so a collection holding a card the plan changes is laid
// out here the same way, on copies, since the landing shares the board's own card objects.
function laidOut(lists: BoardLists) {
  const board = new Map(session.board.cards.map(c => [c.id, c])),
    cards = new Map(lists.cards.map(c => [c.id, c])),
    again: Card[] = [],
    fresh = (c: Card | undefined) => !!c && board.get(c.id) !== c,
    restyled = (c: Card) => laidMarked(c.id) !== marked(c.id);
  for (const s of lists.cards) {
    if (s.type !== 'coll' || !(fresh(s) || s.kids.some(id => fresh(cards.get(id))))) continue;
    const kids = s.kids.flatMap(id => cards.get(id) ?? []),
      heights = new Map(kids.map(k => [k.id, fresh(k) ? heightOf(k) : restyled(k) ? drawnHeight(k) : k.h])),
      coll = copy(s),
      copies = kids.map(copy);
    arrange(coll, copies, k => heights.get(k.id) ?? k.h);
    for (const c of [coll, ...copies]) cards.set(c.id, c);
    again.push(coll, ...copies);
  }
  return { cards, again };
}

// A card the plan doesn't change, measured as it is drawn now, since its look changed after the board last laid it out.
function drawnHeight(c: Card) {
  const el = cardEl(c.id);
  return el ? naturalHeight(c, el) : c.h;
}

// A card the plan changes, as tall as landing will measure it: a note or a to-do list by drawing the plan's copy aside,
// once for each look, since that copy doesn't change while the plan waits.
function heightOf(c: Card) {
  if (c.type === 'image') return Math.round(CW * (c.h / c.w));
  if (c.type !== 'note' && c.type !== 'todo') return c.h;
  const key = `${c.id}|${c.w}|${session.sel.has(c.id)}`,
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

function paint(list: readonly Box[], head: number, hot: number | null) {
  const sig = JSON.stringify([list, head, hot]);
  if (sig === painted) return;
  painted = sig;
  const layer = $('planPreview'),
    lit = (b: Box) => hot !== null && b.steps.includes(hot);
  // a step whose cards have no box, such as a connector, dims none of the others
  layer.classList.toggle('lit', list.some(lit));
  layer.replaceChildren(...list.map((b, i) => boxEl(b, i === head, lit(b))));
}

// The box, with its name on its top edge, the way a group's name sits on its outline, so it never prints over the
// card's words. One box carries the preview's own name there instead: both together spill past a narrow box onto the
// cards beside it.
function boxEl(b: Box, headed: boolean, hot: boolean) {
  const el = document.createElement('div'),
    name = headed ? HEAD : b.label;
  el.className = `pp-box ${b.kind}`;
  el.classList.toggle('hot', hot);
  el.dataset.pp = b.id;
  Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
  if (name) {
    const row = el.appendChild(document.createElement('div')),
      tag = row.appendChild(document.createElement('span'));
    row.className = 'pp-tags';
    tag.className = headed ? 'pp-head' : 'pp-label';
    tag.textContent = name;
  }
  return el;
}
