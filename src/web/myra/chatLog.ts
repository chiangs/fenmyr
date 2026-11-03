import type { ChatMsg } from '../../shared/model.ts';
import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import type { SayAction } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { closestTo, esc, textField } from '../ui/dom.ts';

// earlier chats: when chats are saved with the board, New chat puts the current one away (the last 10 are kept) and History brings one back
import { ask } from './chat.ts';

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

function msgEl(m: ChatMsg & { acts?: SayAction[] }) {
  const d = document.createElement('div');
  d.className = `mc-msg ${m.who}`;
  d.textContent = m.text;
  if (m.acts?.length) {
    const box = document.createElement('div');
    box.className = 'm-acts';
    m.acts.forEach(a => {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.className = a.cls || (a.ghost ? 'ghost' : '');
      b.onclick = () => {
        box.remove();
        a.run();
      };
      box.appendChild(b);
    });
    d.appendChild(box);
  }
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
    const ideas = IDEAS.filter(i => settings.mobbin || !/Mobbin/.test(i))
      .map(i => `<button>${i}</button>`)
      .join('');
    list.innerHTML = `<div class="mc-empty"><b>Hi! I'm Myra ✦</b>Ask me to sort, write, plan or find things for this board.<div class="mc-ideas">${ideas}</div></div>`;
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

export function addMsg(who: string, text: string, acts: SayAction[] = []) {
  if (!session.board) return;
  if (appState.histOpen) {
    appState.histOpen = false;
    renderChat();
  }
  const log = chatLog(),
    m = { who, text, t: Date.now() },
    max = Number(settings.chatMax) || 60;
  log.push(m);
  if (log.length > max) log.splice(0, log.length - max);
  if (chatKeep() === 'board') save();
  const list = $('mcList');
  list.querySelector('.mc-empty')?.remove();
  list.appendChild(msgEl({ ...m, acts }));
  list.scrollTop = list.scrollHeight;
}

export function typing(on: boolean) {
  $('mcList').querySelector('.typing')?.remove();
  $('mcStatus').textContent = on ? 'thinking…' : '';
  if (on) {
    const d = document.createElement('div');
    d.className = 'mc-msg myra typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    $('mcList').appendChild(d);
    $('mcList').scrollTop = 1e9;
  }
}
