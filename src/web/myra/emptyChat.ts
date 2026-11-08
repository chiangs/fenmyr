import { session } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { dayKey } from './birthday.ts';
import { ask } from './chat.ts';
import { starters } from './starters.ts';

const PROTOTYPE_LEAD =
  'What are we building? Tell me what it’s for and who uses it. Put wireframes, sketches, screenshots and notes on the board, or drop pictures right here, and select the ones that matter. Then ask me to build it. The board on the left holds what you bring, the preview runs what I build, and the code pane shows its files. This chat is kept with the prototype.';
const BOARD_LEAD = 'Ask me to sort, write, plan or find things for this board.';
const HELLO = 'Hi! I’m {name} ✦';

// An empty chat: her hello by the name she was given, then up to four things to ask that fit this board.
export function renderGreeting(list: HTMLElement) {
  const board = session.board,
    prototype = board?.kind === 'prototype',
    box = document.createElement('div'),
    hello = document.createElement('b'),
    ideas = document.createElement('div'),
    // the settings pass rewrites every [data-mname], so a rename shows here while the chat is open
    name = window.myraName || 'Myra';
  box.className = 'mc-empty';
  hello.dataset.mname = HELLO;
  hello.textContent = HELLO.replace('{name}', name);
  ideas.className = 'mc-ideas';
  const lines = starters({
    cards: board?.cards ?? [],
    unsorted: board?.tray.length ?? 0,
    selected: session.sel.size,
    prototype,
    mobbin: settings.mobbin,
    dueBy: dayKey(new Date(Date.now() + 7 * 864e5)),
  });
  for (const text of lines) {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = () => {
      ask(text);
    };
    ideas.append(b);
  }
  box.append(hello, prototype ? PROTOTYPE_LEAD : BOARD_LEAD, ideas);
  list.append(box);
}
