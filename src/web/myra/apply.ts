import { summaryLines } from '../../shared/changeSummary.ts';
import {
  type BoardLists,
  type BoardPatch,
  type ChangeSet,
  changeSet,
  landedTouched,
  listsOf,
  recordOf,
} from '../../shared/changes.ts';
import { storedSet } from '../../shared/chat.ts';
import type { Card } from '../../shared/model.ts';
import type { MyraReply } from '../../shared/myraReply.ts';
import { planDo, type Undone } from '../../shared/replyUndo.ts';
import { boxOf } from '../canvas/emptySpot.ts';
import { openCentre, showPlaced, viewShowing } from '../canvas/handles.ts';
import { renderAll, renderCard } from '../canvas/render.ts';
import { renderTray, renderWires } from '../canvas/wires.ts';
import { uid } from '../core/base.ts';
import { remember, save, showWhatMyraMade } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { mdToHTML } from '../docs/docText.ts';
import { docCard, ed } from '../docs/editor.ts';
import { instantiate } from '../features/templateCards.ts';
import { myTpls, useTemplate } from '../features/templates.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { stopPlacing } from '../tools/place.ts';
import { cardEl } from '../ui/dom.ts';
import type { HeldReply, NoteUsed, Picked, Picture } from './applyTypes.ts';
import { effectsOf, runEffects } from './effects.ts';
import { namedIn, planBoard, type ViewAt } from './plan.ts';
import { replyLine } from './replyLine.ts';
import { keepReply } from './replyMemory.ts';
import { reply, say } from './say.ts';

const LEFT_ALONE = 'Another board is open now, so I’ve left the one you asked about as it was.';

// One reply at a time, in the order asked, so two never land in the middle of each other. Applying a reply needs a
// Turn, and only Turn.take makes one. `board`: the board the question was asked on, read when it was asked rather than
// when its turn comes.
export class Turn {
  static #tail: Promise<unknown> = Promise.resolve();
  readonly #board: string;
  private constructor(board: string) {
    this.#board = board;
  }
  static take<T>(work: (turn: Turn) => Promise<T>, board: string): Promise<T> {
    const run = Turn.#tail.then(() => work(new Turn(board)));
    Turn.#tail = run.catch(() => undefined);
    return run;
  }
  // false when another board is open, and then she says so
  stillOpen() {
    if (session.board.id === this.#board) return true;
    reply(LEFT_ALONE, 9000);
    return false;
  }
}

// reply: its id, under which its before-states are kept while the board stays open
export type Applied = { said: string; changes: ChangeSet; reply: string };

const PARALLEL = 3;

// Everything a reply needs from outside the board: its pictures, its template's cards and the vault notes she named.
// The board is not touched.
export async function holdReply(reply: MyraReply, q: string, ctx: Picked): Promise<HeldReply> {
  const o = reply.useTemplate,
    t = o && myTpls.find(x => x.name.toLowerCase() === String(o.name || '').toLowerCase()),
    mode = (o?.mode === 'new' || o?.mode === 'add' ? o.mode : undefined) || t?.mode || 'add',
    // only notes she was actually given, once each
    notes = (reply.vaultNotes ?? [])
      .map(x => ctx.used.find(n => n.vault === x.vault && n.rel === x.path))
      .filter((n, i, a): n is NoteUsed => !!n && a.indexOf(n) === i);
  return {
    reply,
    q,
    ctx,
    pictures: await fetchPictures(reply.images ?? []),
    template: !t
      ? null
      : mode === 'new'
        ? { mode, template: t }
        : { mode: 'add', name: t.name, ...instantiate(t, 0, 0) },
    notes,
  };
}

// fetched a few at a time and kept in the reply's order; one that fails is left out
async function fetchPictures(list: NonNullable<MyraReply['images']>) {
  const got: (Picture | null)[] = list.map(() => null);
  let next = 0;
  const worker = async () => {
    for (let k = next++; k < list.length; k = next++) {
      const im = list[k];
      if (im)
        got[k] = await fetchPicture(im.url).then(
          ([src, w, h]) => ({ src, w, h, x: im.x, y: im.y, caption: im.caption || '' }),
          () => null,
        );
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return got.filter(p => p !== null);
}

async function fetchPicture(url: string): Promise<[string, number, number]> {
  const src = await Fenmyr.fetchImage(url),
    [w0, h0] = await new Promise<[number, number]>(res => {
      const t = new Image();
      t.onload = () => res([t.width, t.height]);
      t.onerror = () => res([3, 4]);
      t.src = src;
    }),
    w = 240;
  return [src, w, Math.min(520, Math.round((w * h0) / w0)) + 16];
}

const viewAt = (): ViewAt => ({
  center: centerWorld(),
  open: openCentre(),
  editing: session.editing,
  centreShowing: (made, box) => centerWorld(viewShowing(made, box)),
});

// The board part of a held reply, planned on a copy of the open board. record: every card and connector it changes, as
// it is and as it will be. touched: every card it makes, moves or edits, in that order.
export type Planned = { held: HeldReply; record: BoardPatch; changes: ChangeSet; touched: string[] };

// The board, the screen and the disk stay as they are. A template that opens its own board plans nothing until that
// board is open: `opened`.
export function planHeld(held: HeldReply, opened = false): Planned {
  const lists = listsOf(session.board),
    { skipped, touched } =
      held.template?.mode === 'new' && !opened ? { skipped: [], touched: [] } : planBoard(lists, held, viewAt()),
    record = recordOf(session.board, lists);
  return { held, record, touched, changes: changeSet(record, { named: namedIn(held.reply), skipped }) };
}

// The board's lists if it landed now, and the cards the person changed since that it would leave. Changes nothing.
export const asItWouldLand = (p: Planned): Undone =>
  planDo(p.record, session.board, new Set(session.editing ? [session.editing] : []));

// Null when another board is open than the one the turn was asked on: then nothing is applied.
export async function applyHeld(turn: Turn, held: HeldReply): Promise<Applied | null> {
  if (!turn.stillOpen()) return null;
  const tpl = held.template;
  if (tpl?.mode === 'new') {
    await useTemplate(tpl.template, 'new');
    // opening a board resets undo on a timer; after it, the reply is an undo step of its own on the new board
    await new Promise(res => setTimeout(res, 0));
  }
  while (appState.drag) await new Promise(requestAnimationFrame);
  const { changes, record, touched } = changeBoard(planHeld(held, true)),
    id = uid(),
    changed = record.cards.length > 0 || record.links.length > 0,
    board = session.board.id;
  if (changed) keepReply(id, record);
  if (tpl?.mode === 'add') say(`Here’s “${tpl.name}” ✦ It’s all yours to change.`, 4000);
  if (touched.length) setTimeout(() => showWhatMyraMade(touched), 250);
  const line = replyLine(held, touched, await runEffects(effectsOf(held), touched));
  // Her line lands on whichever board is open now. An effect such as a new prototype may have opened another one, and
  // what this reply changed means nothing there.
  const kept = changed && session.board.id === board;
  if (!kept) reply(line.text, line.ms, line.acts);
  // the bubble stays long enough to reach Show on board and Undo
  else
    reply(line.text, line.ms && Math.max(line.ms, 16000), [
      ...line.acts,
      { kind: 'changes', reply: id, set: storedSet(changes), lines: summaryLines(record, changes) },
    ]);
  return { said: line.text, changes, reply: id };
}

// Not async on purpose: an await in here would let the undo timer cut the reply into several steps. A reply that
// fails part way puts the board back as it was, so no half of it stays in the board or in the undo history.
function changeBoard(p: Planned) {
  remember();
  const b = session.board,
    before = listsOf(b),
    // planned in this same turn, where planBoard already left the card being typed in
    land = planDo(p.record, b, new Set()),
    left = new Set([...p.changes.skipped, ...land.skipped.map(c => c.id)]),
    touched = landedTouched(p.touched, p.record, recordOf(before, land.lists));
  try {
    putOnBoard(b, land.lists);
    paint(p.held, before, left);
  } catch (e) {
    Object.assign(b, before);
    if (!before.trayLinks) delete b.trayLinks;
    renderAll();
    throw e;
  }
  save();
  const record = recordOf(before, b),
    changes = changeSet(record, { named: namedIn(p.held.reply), skipped: [...left] });
  remember();
  const onBoard = new Map(b.cards.map(c => [c.id, c]));
  return { changes, record, touched: touched.flatMap(id => onBoard.get(id) ?? []) };
}

// The board takes the lists, but a card that stays keeps its object, changed in place, since the doc editor holds the
// open doc's.
function putOnBoard(b: BoardLists, lists: BoardLists) {
  const had = new Map([...b.cards, ...b.tray].map(c => [c.id, c])),
    kept = (c: Card) => {
      const o = had.get(c.id);
      if (!o || o === c) return c;
      for (const k of Object.keys(o)) if (!(k in c)) Reflect.deleteProperty(o, k);
      return Object.assign(o, c);
    };
  b.cards = lists.cards.map(kept);
  b.tray = lists.tray.map(kept);
  b.links = lists.links;
  if (lists.trayLinks) b.trayLinks = lists.trayLinks;
  else delete b.trayLinks;
}

function paint(held: HeldReply, before: BoardLists, skipped: ReadonlySet<string>) {
  const r = held.reply,
    b = session.board,
    had = new Set(before.cards.map(c => c.id)),
    has = new Set(b.cards.map(c => c.id)),
    named = (ids: { id: string }[] = []) =>
      b.cards.filter(c => had.has(c.id) && !skipped.has(c.id) && ids.some(o => o.id === c.id));
  for (const id of had) if (!has.has(id)) cardEl(id)?.remove();
  for (const c of named(r.move?.filter(o => o.x != null))) {
    const el = cardEl(c.id);
    if (!el) continue;
    el.style.transition = 'left .6s cubic-bezier(.2,.8,.3,1), top .6s cubic-bezier(.2,.8,.3,1)';
    renderCard(c);
    setTimeout(() => {
      el.style.transition = '';
    }, 650);
  }
  for (const c of b.cards) if (!had.has(c.id)) renderCard(c, true);
  for (const c of named(r.edit)) renderCard(c, true);
  if (docCard && ed && r.edit?.some(o => o.id === docCard?.id && o.body != null))
    ed.commands.setContent(mdToHTML(docCard.body ?? ''), false);
  renderTray();
  renderWires();
  if (held.template?.mode === 'add') {
    const ids = new Set(held.template.cards.map(c => c.id)),
      placed = b.cards.filter(c => ids.has(c.id));
    stopPlacing();
    showPlaced(placed, boxOf(placed));
  }
}
