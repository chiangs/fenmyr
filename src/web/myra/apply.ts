import { type BoardLists, type ChangeSet, changeSet, listsOf, recordOf } from '../../shared/changes.ts';
import type { MyraReply } from '../../shared/myraReply.ts';
import { boxOf } from '../canvas/emptySpot.ts';
import { openCentre, showPlaced, viewShowing } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { renderTray, renderWires } from '../canvas/wires.ts';
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

export type Applied = { said: string; changes: ChangeSet };

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

// The board part of a held reply, planned on a copy: the board, the screen and the disk stay as they are. Null when
// the reply opens a new board, since there is nothing here to preview.
export function previewHeld(held: HeldReply): { lists: BoardLists; changes: ChangeSet } | null {
  if (held.template?.mode === 'new') return null;
  const lists = listsOf(session.board),
    skipped = planBoard(lists, held, viewAt());
  return { lists, changes: changeSet(recordOf(session.board, lists), lists, { named: namedIn(held.reply), skipped }) };
}

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
  const { changes, touched } = changeBoard(held);
  if (tpl?.mode === 'add') say(`Here’s “${tpl.name}” ✦ It’s all yours to change.`, 4000);
  if (touched.length) setTimeout(() => showWhatMyraMade(touched), 250);
  const line = replyLine(held, touched, await runEffects(effectsOf(held), touched));
  reply(line.text, line.ms, line.acts);
  return { said: line.text, changes };
}

// Not async on purpose: an await in here would let the undo timer cut the reply into several steps.
function changeBoard(held: HeldReply) {
  remember();
  const b = session.board,
    before = listsOf(b),
    skipped = planBoard(b, held, viewAt());
  paint(held, before, new Set(skipped));
  save();
  const changes = changeSet(recordOf(before, b), b, { named: namedIn(held.reply), skipped });
  remember();
  const ids = new Set([...changes.added, ...changes.moved, ...changes.edited]);
  return { changes, touched: b.cards.filter(c => ids.has(c.id)) };
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
