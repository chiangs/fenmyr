import type { ChatMsg } from '../../shared/chat.ts';
import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { closestTo, esc, textField } from '../ui/dom.ts';
import { type Act, storedOf } from './acts.ts';
import { ask } from './chat.ts';
import { drawActs } from './replyView.ts';
import { paintStatus } from './status.ts';

// earlier chats: when chats are saved with the board, New chat puts the current one away (the last 10 are kept) and Earlier chats brings one back
const CHATS_KEPT = 10;

// A prototype board always keeps its chat, whatever Settings says. It's the record of how the prototype was built.
export const chatKeep = (): string => (session.board?.kind === 'prototype' ? 'board' : settings.chatKeep);

const keepsHistory = () => chatKeep() === 'board' && !!session.board;

export function archiveChat() {
  const msgs = session.board?.chat ?? [],
    first = msgs.find(m => m.who === 'me') || msgs[0];
  if (!keepsHistory() || !first) return;
  session.board.chats = [
    {
      id: uid(),
      title: String(first.text || 'Chat')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70),
      t: msgs.at(-1)?.t || Date.now(),
      msgs,
    },
    ...(session.board.chats || []),
  ].slice(0, CHATS_KEPT);
}

const whenText = (t: number) => {
  const d = new Date(t),
    days = Math.floor((Date.now() - t) / 864e5);
  return days < 1
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : days < 7
      ? d.toLocaleDateString([], { weekday: 'short' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

function renderHistory() {
  const list = $('mcList'),
    chats = session.board.chats || [];
  list.innerHTML =
    `<div class="mc-hist"><div class="mh-top"><button class="mc-btn" data-h="back">← Back to this chat</button><span>Earlier chats on this board</span></div>` +
    (chats.length
      ? chats
          .map((c, i) => {
            const when = esc(whenText(c.t)),
              n = c.msgs.length,
              count = `${n} message${n === 1 ? '' : 's'}`;
            return `<div class="mh-row" data-i="${i}"><button class="mh-open" data-h="open"><b></b><small>${when} · ${count}</small></button><button class="mh-del" data-h="del" title="Delete this chat">×</button></div>`;
          })
          .join('')
      : '<div class="mc-empty">No earlier chats yet. New chat puts the current one here.</div>') +
    '</div>';
  for (const r of list.querySelectorAll('.mh-row')) {
    const title = r.querySelector('b'),
      i = r instanceof HTMLElement ? Number(r.dataset.i) : -1;
    if (title) title.textContent = chats[i]?.title ?? '';
  }
  list.onclick = e => {
    const a = closestTo(e.target, '[data-h]')?.dataset.h;
    if (!a) return;
    e.stopPropagation();
    const i = Number(closestTo(e.target, '.mh-row')?.dataset.i);
    if (a === 'back') {
      appState.histOpen = false;
      return renderChat();
    }
    if (a === 'del') {
      const del = closestTo(e.target, '.mh-del');
      if (!del) return;
      if (!del.classList.contains('sure')) {
        del.classList.add('sure');
        del.textContent = 'Delete?';
        return;
      }
      chats.splice(i, 1);
      save();
      return renderChat();
    }
    if (a === 'open') {
      const c = chats.splice(i, 1)[0];
      if (!c) return;
      archiveChat();
      // her buttons there were for the board as it was then, so the chat comes back without them
      for (const m of c.msgs) delete m.acts;
      session.board.chat = c.msgs;
      save();
      appState.histOpen = false;
      renderChat();
      textField('mcInput').focus();
    }
  };
}

const IDEAS = [
  'Group these by theme',
  'What am I missing?',
  'Make a checklist from this',
  'Find onboarding screens on Mobbin',
];
// on a prototype board she starts from the wireframes and notes the person brings
const PROTOTYPE_IDEAS = ['Sum up what these cards say', 'What should the first screen show?', 'What am I missing?'];

function msgEl(m: ChatMsg, acts: readonly Act[] = m.acts ?? []) {
  const d = document.createElement('div'),
    parts = document.createElement('div');
  d.className = `mc-msg ${m.who}`;
  d.textContent = m.text;
  parts.className = 'm-parts';
  d.appendChild(parts);
  drawActs(parts, m, acts);
  return d;
}

export function renderChat() {
  $('mcHist').hidden = !(keepsHistory() && ((session.board.chats || []).length || appState.histOpen));
  $('mcHist').classList.toggle('on', appState.histOpen);
  if (appState.histOpen && keepsHistory()) return renderHistory();
  appState.histOpen = false;
  const list = $('mcList');
  list.onclick = null;
  list.innerHTML = '';
  const msgs = chatLog();
  if (!msgs.length) {
    const ideas = (session.board?.kind === 'prototype' ? PROTOTYPE_IDEAS : IDEAS)
      .filter(i => settings.mobbin || !/Mobbin/.test(i))
      .map(i => `<button>${i}</button>`)
      .join('');
    const lead =
      session.board?.kind === 'prototype'
        ? 'What are we building? Tell me what it’s for and who uses it. Put wireframes, sketches, screenshots and notes on the board, or drop pictures right here, and select the ones that matter. Then ask me to build it. The board on the left holds what you bring, the preview runs what I build, and the code pane shows its files. This chat is kept with the prototype.'
        : 'Ask me to sort, write, plan or find things for this board.';
    list.innerHTML = `<div class="mc-empty"><b>Hi! I'm Myra ✦</b>${lead}<div class="mc-ideas">${ideas}</div></div>`;
    for (const b of list.querySelectorAll('.mc-ideas button'))
      if (b instanceof HTMLElement)
        b.onclick = () => {
          ask(b.textContent ?? '');
        };
    return;
  }
  msgs.forEach(m => {
    list.appendChild(msgEl(m));
  });
  // a chat reopened while she is still answering gets her dots back
  paintStatus();
  list.scrollTop = list.scrollHeight;
}

// where a chat lives depends on Settings: saved with the board, kept only until Myra quits, or not kept at all
// board id → its chat, when chats aren't saved with the board
export const sessionChats: Record<string, ChatMsg[]> = {};

export function chatLog(): ChatMsg[] {
  if (!session.board) return [];
  if (chatKeep() === 'board') return (session.board.chat = session.board.chat || []);
  return (sessionChats[session.board.id] ??= []);
}

// Shows the line with all of `acts` and keeps the stored kinds on the message, which it returns.
export function addMsg(who: string, text: string, acts: readonly Act[] = []) {
  if (!session.board) return;
  if (appState.histOpen) {
    appState.histOpen = false;
    renderChat();
  }
  const log = chatLog(),
    m: ChatMsg = { who, text, t: Date.now() },
    stored = storedOf(acts),
    max = Number(settings.chatMax) || 60;
  if (stored.length) m.acts = stored;
  log.push(m);
  if (log.length > max) log.splice(0, log.length - max);
  if (chatKeep() === 'board') save();
  const list = $('mcList');
  list.querySelector('.mc-empty')?.remove();
  list.appendChild(msgEl(m, acts));
  list.scrollTop = list.scrollHeight;
  return m;
}
