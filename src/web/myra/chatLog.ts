import type { ChatMsg, SavedChat } from '../../shared/chat.ts';
import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { child, closestTo, esc, textField } from '../ui/dom.ts';
import { type Act, storedOf } from './acts.ts';
import { renderGreeting } from './emptyChat.ts';
import { drawActs } from './replyView.ts';
import { paintStatus } from './status.ts';

// earlier chats: when chats are saved with the board, New chat puts the current one away (the last 10 are kept) and Earlier chats brings one back
const CHATS_KEPT = 10;

// A prototype board always keeps its chat, whatever Settings says. It's the record of how the prototype was built.
export const chatKeep = (): string => (session.board?.kind === 'prototype' ? 'board' : settings.chatKeep);

const keepsHistory = () => chatKeep() === 'board' && !!session.board;

// The earlier chat a prototype has open to read. It can outlive its board, so it counts only while the board has it.
let reading: SavedChat | undefined;

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

// Her buttons there were for the board as it was then, so none show
function renderReading(list: HTMLElement, c: SavedChat) {
  list.innerHTML =
    '<div class="mc-hist"><div class="mh-top"><button class="mc-btn" data-h="back">← Back to this chat</button><span>From before this prototype kept one chat.</span></div></div>';
  for (const m of c.msgs) list.appendChild(msgEl(m, []));
  list.scrollTop = 0;
}

function renderHistory() {
  const list = $('mcList'),
    chats = session.board.chats || [];
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
    if (a === 'open' && session.board.kind === 'prototype') {
      reading = chats[i];
      renderChat();
      return child(list, '[data-h="back"]').focus();
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
  if (reading && chats.includes(reading)) return renderReading(list, reading);
  const none =
    session.board.kind === 'prototype'
      ? 'No earlier chats.'
      : 'No earlier chats yet. New chat puts the current one here.';
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
      : `<div class="mc-empty">${none}</div>`) +
    '</div>';
  for (const r of list.querySelectorAll('.mh-row')) {
    const title = r.querySelector('b'),
      i = r instanceof HTMLElement ? Number(r.dataset.i) : -1;
    if (title) title.textContent = chats[i]?.title ?? '';
  }
}

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
  reading = undefined;
  const list = $('mcList');
  list.onclick = null;
  list.innerHTML = '';
  const msgs = chatLog();
  if (!msgs.length) return renderGreeting(list);
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
