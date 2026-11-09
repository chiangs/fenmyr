// What shows under one of Myra's lines, in the chat and in her bubble alike: the change summary and rows of buttons,
// drawn from the acts the line still has.
import type { ChatAction, ChatMsg } from '../../shared/chat.ts';
import { save } from '../core/history.ts';
import { type Act, type After, type Button, type Piece, piecesOf, SLOTS, storedOf } from './acts.ts';
import { chatKeep } from './chatLog.ts';

// how many times each host has been drawn, so a click that drew something else there doesn't draw over it
const drawn = new WeakMap<HTMLElement, number>();

// A used button doesn't come back when the chat opens again: a click takes what it takes off the message too.
function spend(m: ChatMsg, used: readonly ChatAction[]) {
  if (!m.acts || !used.length) return;
  const left = m.acts.filter(a => !used.includes(a));
  if (left.length) m.acts = left;
  else delete m.acts;
  if (chatKeep() === 'board') save();
}

function summaryEl(p: Extract<Piece, { slot: 'summary' }>) {
  const box = document.createElement('div'),
    head = document.createElement('b'),
    list = document.createElement(p.numbered ? 'ol' : 'ul');
  box.className = p.cls ? `m-summary ${p.cls}` : 'm-summary';
  head.textContent = p.head;
  for (const line of p.lines) list.appendChild(document.createElement('li')).textContent = line;
  box.append(head, list);
  return box;
}

function sourcesEl(head: string) {
  const box = document.createElement('div');
  box.className = 'm-sources';
  box.appendChild(document.createElement('b')).textContent = head;
  return box;
}

// Draws `acts` into `host`. A click takes away what its button says, spends the stored ones on `m`, tells `onClick`,
// runs, and draws again from what is left, so a button that stays shows only while it still applies.
export function drawActs(
  host: HTMLElement,
  m: ChatMsg | undefined,
  acts: readonly Act[],
  onClick?: (after: After) => void,
) {
  const turn = (drawn.get(host) ?? 0) + 1;
  drawn.set(host, turn);
  host.replaceChildren();
  const pieces = acts.flatMap(a => piecesOf(a).map((p): [Act, Piece] => [a, p]));
  const button = (
    into: HTMLElement,
    { label, cls, ghost, title, after, run }: Button,
    a: Act,
    slotActs: readonly Act[],
  ) => {
    const b = into.appendChild(document.createElement('button'));
    b.textContent = label;
    b.className = cls || (ghost ? 'ghost' : '');
    if (title) b.title = title;
    b.onclick = () => {
      const gone = after === 'stay' ? [] : after === 'self' ? [a] : slotActs;
      if (m) spend(m, storedOf(gone));
      onClick?.(after);
      run();
      if (drawn.get(host) === turn)
        drawActs(
          host,
          m,
          acts.filter(x => !gone.includes(x)),
          onClick,
        );
    };
  };
  for (const slot of SLOTS) {
    const here = pieces.filter(([, p]) => p.slot === slot),
      all = here.map(([x]) => x);
    const row = document.createElement('div');
    row.className = 'm-acts';
    for (const [a, p] of here) {
      if (p.slot === 'summary') {
        if (p.lines.length) host.appendChild(summaryEl(p));
      } else if (p.slot === 'sources') {
        const box = host.appendChild(sourcesEl(p.head));
        for (const l of p.links) button(box, { ...l, cls: 'm-link' }, a, all);
      } else button(row, p.button, a, all);
    }
    if (row.childElementCount) host.appendChild(row);
  }
}
