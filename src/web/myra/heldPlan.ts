// A reply that would add, move or edit more than 10 cards, or remove any, waits in the chat as a plan. Do it lands that
// same reply, with no second request to Claude, and Cancel leaves the board as it was. One plan waits at a time, in
// memory; its message keeps the steps, so the chat still shows what she proposed once it stops waiting.
import { asksFirst, weigh } from '../../shared/askFirst.ts';
import { summaryLines } from '../../shared/changeSummary.ts';
import type { ChatAction, PlanEnd } from '../../shared/chat.ts';
import { uid } from '../core/base.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import type { Piece } from './acts.ts';
import { applyHeld, asItWouldLand, type Planned, planHeld, planNewBoard, Turn } from './apply.ts';
import type { HeldReply } from './applyTypes.ts';
import { chatKeep, renderChat } from './chatLog.ts';
import { reply } from './say.ts';

type PlanAct = Extract<ChatAction, { kind: 'plan' }>;
type Waiting = { act: PlanAct; board: string; planned: Planned };

let waiting: Waiting | null = null;
// plans whose Do it is waiting its turn behind a reply still to come
const landing = new Set<string>();

const LEAD = 'Here’s my plan. Nothing changes until you say so.';
const FAILED =
  'Something went wrong part way, so I’ve put the board back as it was. The plan is still here if you want to try again.';

type State = 'waiting' | 'landing' | PlanEnd | 'dropped';
const HEAD: Record<State, string> = {
  waiting: 'If you say yes',
  landing: 'Doing it…',
  done: 'Done',
  cancelled: 'Cancelled · nothing changed',
  replaced: 'Replaced by the plan below',
  dropped: 'Not done',
};
const stateOf = (a: PlanAct): State =>
  waiting?.act.plan === a.plan ? 'waiting' : landing.has(a.plan) ? 'landing' : (a.ended ?? 'dropped');

// What a reply would do, counted and worded: on this board, or on the board a template opens for it.
function outline({ held, record, changes }: Planned) {
  const tpl = held.template;
  if (tpl?.mode !== 'new') return { weight: weigh(record, changes), steps: summaryLines(record, changes) };
  const own = planNewBoard(held, tpl.template);
  return {
    weight: weigh(own.record, own.changes),
    steps: [`+ 1 board from the template “${tpl.template.name}”`, ...summaryLines(own.record, own.changes)],
  };
}

// Her answer as it arrives: it lands at once, or it waits as a plan.
export async function settle(turn: Turn, held: HeldReply) {
  if (!turn.stillOpen()) return;
  const planned = planHeld(held),
    { weight, steps } = outline(planned),
    changes = planned.record.cards.length + planned.record.links.length > 0 || held.template?.mode === 'new';
  if (changes && !settings.skipPlans && asksFirst(weight)) return hold(planned, steps);
  await applyHeld(turn, held);
}

function hold(planned: Planned, steps: string[]) {
  if (waiting) end(waiting, 'replaced');
  const act: PlanAct = { kind: 'plan', plan: uid(), steps };
  waiting = { act, board: session.board.id, planned };
  reply(LEAD, 0, [act]);
}

// The plan's message is drawn again, and saved with the board when chats are.
function redraw() {
  if (chatKeep() === 'board') save();
  renderChat();
}

function end(w: Waiting, how: PlanEnd) {
  if (waiting === w) waiting = null;
  w.act.ended = how;
  redraw();
}

// It stops waiting at once, so a second press finds nothing, and lands when its turn comes. It is done before it lands,
// since a template opens its own board first. If the board part fails, the board is put back and the plan waits again.
function doIt(w: Waiting) {
  if (waiting !== w) return Promise.resolve();
  waiting = null;
  landing.add(w.act.plan);
  redraw();
  return Turn.take(async turn => {
    landing.delete(w.act.plan);
    if (!turn.stillOpen()) return;
    end(w, 'done');
    try {
      await applyHeld(turn, w.planned.held, w.planned);
    } catch {
      delete w.act.ended;
      waiting ??= w;
      redraw();
      reply(FAILED, 0);
    }
  }, w.board);
}

// A function declaration: VIEW reads it while the modules load, inside an import cycle.
export function planPieces(a: PlanAct): Piece[] {
  const state = stateOf(a),
    w = waiting?.act.plan === a.plan ? waiting : null,
    pieces: Piece[] = [{ slot: 'summary', head: HEAD[state], lines: a.steps, numbered: true, cls: `plan ${state}` }];
  if (w)
    pieces.push(
      { slot: 'reply', button: { label: 'Do it', after: 'stay', run: () => doIt(w) } },
      { slot: 'reply', button: { label: 'Cancel', ghost: true, after: 'stay', run: () => end(w, 'cancelled') } },
    );
  return pieces;
}

// The board's lists if the waiting plan landed now, which Do it then lands: for tests.
export const heldLists = () => (waiting ? asItWouldLand(waiting.planned).lists : null);
