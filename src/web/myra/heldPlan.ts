// A reply that would add, move or edit more than 10 cards, or remove any, waits in the chat as a plan. Do it lands that
// same reply, with no second request to Claude, and Cancel leaves the board as it was. Anything else they write goes
// to her with the plan. One plan waits at a time, in memory; its message keeps the steps, so the chat still shows what
// she proposed once it stops waiting. While it waits, the board shows it as a preview (planPreview.ts).
import { answerOf, asksFirst, weigh } from '../../shared/askFirst.ts';
import { type Step, summarySteps } from '../../shared/changeSummary.ts';
import type { ChatAction, PlanEnd } from '../../shared/chat.ts';
import type { PlanAsk } from '../../shared/ops.ts';
import { uid } from '../core/base.ts';
import { boardRevision, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { setFlag, settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { textField } from '../ui/dom.ts';
import type { Piece } from './acts.ts';
import { applyHeld, asItWouldLand, type Planned, planHeld, planNewBoard, Turn } from './apply.ts';
import type { HeldReply, NoteUsed } from './applyTypes.ts';
import { addMsg, chatKeep, renderChat } from './chatLog.ts';
import { chatOpen, myraOpen, renderHint } from './chatWindow.ts';
import { noEmoji } from './replyText.ts';
import { reply } from './say.ts';

type PlanAct = Extract<ChatAction, { kind: 'plan' }>;
// parts: the cards each step covers, in the order of act.steps
type Waiting = { act: PlanAct; board: string; planned: Planned; parts: string[][] };

let waiting: Waiting | null = null;
// plans whose Do it is waiting its turn behind a reply still to come
const landing = new Set<string>();

const LEAD = 'Here’s my plan. Nothing changes until you say so.';
const JUST = 'From now on I’ll make big changes straight away. Settings → Myra brings plans back.';
const JUST_TIP = 'Do this, and make big changes straight away from now on';
const FAILED =
  'Something went wrong part way, so I’ve put the board back as it was. The plan is still here if you want to try again.';

type State = 'waiting' | 'landing' | PlanEnd | 'dropped';
const HEAD: Record<State, string> = {
  waiting: 'If you say yes',
  landing: 'Doing it…',
  done: 'Done',
  left: 'Not done · changed since the plan',
  cancelled: 'Cancelled · nothing changed',
  replaced: 'Replaced by the plan below',
  superseded: 'Replaced by the change below',
  dropped: 'Not done',
};
const stateOf = (a: PlanAct): State =>
  waiting?.act.plan === a.plan ? 'waiting' : landing.has(a.plan) ? 'landing' : (a.ended ?? 'dropped');

// What a reply would do, counted and worded: on this board, or on the board a template opens for it.
// A template's own board isn't open, so none of its steps has a part on this one.
function outline({ held, record, changes }: Planned): { weight: ReturnType<typeof weigh>; steps: Step[] } {
  const tpl = held.template;
  if (tpl?.mode !== 'new') return { weight: weigh(record, changes), steps: summarySteps(record, changes) };
  const own = planNewBoard(held, tpl.template);
  return {
    weight: weigh(own.record, own.changes),
    steps: [
      `+ 1 board from the template “${tpl.template.name}”`,
      ...summarySteps(own.record, own.changes).map(s => s.line),
    ].map(line => ({ line, cards: [] })),
  };
}

// Her answer as it arrives: it lands at once, or it waits as a plan. `about`: the plan that was waiting when the
// message was sent. An answer that changes the board replaces it and waits as a plan however small, since they are
// looking at one; words alone leave it waiting, `dropPlan` cancels it, and `doPlan`, their yes to it as it stands, lands
// the plan as held after her words.
export async function settle(turn: Turn, held: HeldReply, about: string | null) {
  if (!turn.stillOpen()) return;
  const w = waiting?.act.plan === about ? waiting : null;
  if (w && held.reply.doPlan) {
    waiting = null;
    if (held.reply.say) reply(noEmoji(held.reply.say), 9000);
    return land(turn, w);
  }
  const planned = planHeld(held),
    { weight, steps } = outline(planned),
    changes = planned.record.cards.length + planned.record.links.length > 0 || held.template?.mode === 'new',
    holds = changes && !settings.skipPlans && (w !== null || asksFirst(weight));
  if (w && (changes || held.reply.dropPlan)) end(w, !changes ? 'cancelled' : holds ? 'replaced' : 'superseded');
  if (holds) return hold(planned, steps);
  await applyHeld(turn, held);
}

function hold(planned: Planned, steps: Step[]) {
  if (waiting) end(waiting, 'replaced');
  const act: PlanAct = { kind: 'plan', plan: uid(), steps: steps.map(s => s.line) };
  waiting = { act, board: session.board.id, planned, parts: steps.map(s => s.cards) };
  reply(LEAD, 0, [act]);
  renderHint();
}

// The plan's message is drawn again, and saved with the board when chats are.
function redraw() {
  if (chatKeep() === 'board') save();
  renderChat();
  renderHint();
}

function end(w: Waiting, how: PlanEnd) {
  if (waiting === w) waiting = null;
  w.act.ended = how;
  redraw();
}

// It stops waiting at once, so a second press finds nothing, and lands when its turn comes.
function doIt(w: Waiting) {
  if (waiting !== w) return Promise.resolve();
  waiting = null;
  landing.add(w.act.plan);
  redraw();
  return Turn.take(turn => land(turn, w), w.board);
}

// The held reply lands as planned, less what the person changed since. It is done before it lands, since a template
// opens its own board first. If the board part fails, the board is put back and the plan waits again, unless that
// template's board is open by then.
async function land(turn: Turn, w: Waiting) {
  landing.delete(w.act.plan);
  if (!turn.stillOpen()) return;
  end(w, 'done');
  try {
    if ((await applyHeld(turn, w.planned.held, w.planned))?.leftAll) end(w, 'left');
  } catch {
    delete w.act.ended;
    if (session.board.id === w.board) waiting ??= w;
    redraw();
    reply(FAILED, 0);
  }
}

// Do it, and from now on big changes land straight away, as the Skip plans setting says.
function justDoIt(w: Waiting) {
  if (waiting !== w) return Promise.resolve();
  setFlag('skipPlans', true);
  applySettings();
  const done = doIt(w);
  reply(JUST, 9000);
  return done;
}

// Nothing is sent: they write what to change, and it goes with the plan.
function changePlan() {
  if (!chatOpen()) myraOpen(true);
  textField('mcInput').focus();
}

// What Do it would land now, worked out again only when the board saves or they start or stop typing in a card.
let lands: { key: string; land: ReturnType<typeof asItWouldLand> } | null = null;
function landsNow(w: Waiting) {
  const key = `${w.act.plan}|${boardRevision()}|${session.editing}`;
  if (lands?.key === key) return lands;
  lands = { key, land: asItWouldLand(w.planned) };
  return lands;
}

/** The waiting plan as the board preview draws it, asked every frame. key: changes when what Do it would land does. */
export function waitingNow() {
  const w = waiting;
  if (!w) return null;
  const { key, land } = landsNow(w);
  return { id: w.act.plan, key, planned: w.planned, parts: w.parts, land };
}

// A function declaration: VIEW reads it while the modules load, inside an import cycle.
export function planPieces(a: PlanAct): Piece[] {
  const state = stateOf(a),
    w = waiting?.act.plan === a.plan ? waiting : null,
    pieces: Piece[] = [{ slot: 'summary', head: HEAD[state], lines: a.steps, numbered: true, cls: `plan ${state}` }];
  if (w)
    pieces.push(
      { slot: 'reply', button: { label: 'Do it', after: 'stay', run: () => doIt(w) } },
      { slot: 'reply', button: { label: 'Change the plan', ghost: true, after: 'stay', run: changePlan } },
      { slot: 'reply', button: { label: 'Cancel', ghost: true, after: 'stay', run: () => end(w, 'cancelled') } },
      {
        slot: 'reply',
        button: { label: 'Just do it', ghost: true, title: JUST_TIP, after: 'stay', run: () => justDoIt(w) },
      },
    );
  return pieces;
}

// A typed yes, no or "just do it" while a plan waits answers it here, with no request to Claude. Null when it isn't one.
export function answerPlan(q: string): Promise<void> | null {
  const w = waiting,
    said = w && answerOf(q);
  if (!w || !said) return null;
  if (!chatOpen()) myraOpen(true);
  addMsg('me', q);
  if (said === 'do') return doIt(w);
  if (said === 'just') return justDoIt(w);
  end(w, 'cancelled');
  return Promise.resolve();
}

export const planWaits = () => waiting !== null;

// The plan stops waiting, in memory only, so its message reads Not done: another board opened, or the chat that held
// its buttons was put away or cleared.
export function dropPlan() {
  waiting = null;
  renderHint();
}

// The waiting plan as it goes with the next message: what it answered, her reply without her words, its steps, and
// the notes she read for it, so a changed plan can still place them.
export function planAsk(): { id: string; ask: PlanAsk; used: NoteUsed[] } | null {
  if (!waiting) return null;
  const { act, planned } = waiting,
    { say: _say, next: _next, pages: _pages, ...board } = planned.held.reply;
  return {
    id: act.plan,
    ask: { request: planned.held.q, reply: JSON.stringify(board), steps: act.steps },
    used: planned.held.ctx.used,
  };
}

// The board's lists if the waiting plan landed now, which Do it then lands: for tests.
export const heldLists = () => (waiting ? asItWouldLand(waiting.planned).lists : null);
