import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { closestTo, isTyping, textField } from '../ui/dom.ts';
import { reply } from './say.ts';
import { stopAll, stoppable } from './stop.ts';

const LINE = 'Okay, I’ve stopped.';

/** Stops everything Myra is doing for the open board, and says so once. */
function stopWork() {
  if (stopAll(session.board.id)) reply(LINE);
}

// Ctrl+. (⌘. on a Mac), the key Stop names in its tip
const isStopKey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === '.' || e.code === 'Period');

export function initStop() {
  const send = $('mcSend');
  // While she works the button stops her. Without this the click would be the form's submit.
  send.addEventListener('click', e => {
    if (!stoppable(session.board.id)) return;
    e.preventDefault();
    stopWork();
    textField('mcInput').focus();
  });
  addEventListener('keydown', e => {
    if (!isStopKey(e) || e.isComposing || !stoppable(session.board.id)) return;
    // the chat's own box is for Stop too, but a note or a doc being written keeps its keys
    if (isTyping(e.target) && !closestTo(e.target, '#mChat')) return;
    e.preventDefault();
    stopWork();
  });
}
