import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';

/** Something Myra is doing for a board that the person can stop. `stop` ends the work for good, and is called once. */
export type Stoppable = { board: string; stop: () => void };

// Everything running or waiting to run, whatever it is: a question to Claude, a build. One press of Stop ends all those of
// the open board, and the send button is Stop for as long as there is one.
const running = new Set<Stoppable>();

/** Lists `work` as stoppable. The call it returns takes it off the list again, and does nothing the second time. */
export function addStoppable(work: Stoppable): () => void {
  running.add(work);
  paintSend();
  return () => {
    if (running.delete(work)) paintSend();
  };
}

export const stoppable = (board: string) => [...running].some(w => w.board === board);

/** Stops all that runs for the board, and says how many. Each is off the list before it is stopped, so what a stop does
 *  to the page sees the button as it will be. */
export function stopAll(board: string): number {
  const these = [...running].filter(w => w.board === board);
  for (const w of these) running.delete(w);
  paintSend();
  for (const w of these) w.stop();
  return these.length;
}

const LABEL = {
  send: { name: 'Send', tip: 'Send (⌘↩)', told: 'Stop is now Send' },
  stop: { name: 'Stop', tip: 'Stop (⌘.)', told: 'Send is now Stop' },
};

// What a screen reader hears of the change, from a live region of its own beside the button: the status line's holds
// "Thinking…" and the like, which the words would join. A button that has changed back before the words are said has
// nothing to tell, and they are cleared after a while so that reading the page doesn't meet them.
const TOLD_MS = 8000;
let clearT: ReturnType<typeof setTimeout> | undefined;
let spoken = false;
function tell() {
  const now = isStop();
  if (now === spoken) return;
  spoken = now;
  $('mcSendSay').textContent = LABEL[now ? 'stop' : 'send'].told;
  clearTimeout(clearT);
  clearT = setTimeout(() => {
    $('mcSendSay').textContent = '';
  }, TOLD_MS);
}

const send = () => $('mcSend');
const isStop = () => send().classList.contains('stop');

/** Draws the send button as Stop while the open board has work to stop, and as Send when it has none. */
export function paintSend() {
  const el = send(),
    on = !!session.board && stoppable(session.board.id);
  if (on === el.classList.contains('stop')) return;
  const label = LABEL[on ? 'stop' : 'send'];
  el.classList.toggle('stop', on);
  el.setAttribute('aria-label', label.name);
  el.dataset.tip = label.tip;
  setTimeout(tell, 0);
}
