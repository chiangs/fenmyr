import { cardEl, esc } from '../ui/dom.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { cardsEl } from '../core/dom.ts';
import { remember, save, showWhatMyraMade } from '../core/history.ts';
import { osNotify } from './timer.ts';
import { closeHome, openBoard } from '../library/home.ts';
import { bdNow } from '../myra/birthday.ts';
import { chirp, reply, say } from '../settings/licenses.ts';
import { appState, session } from '../core/state.ts';
import { type Card, isRecord } from '../../shared/model.ts';

// one note with a due date, on any board: b the board, c the card, d its due, t when to remind, n its words, bn the board's name
export type DueItem = { b: string; c: string; d: string; t: number; n: string; bn: string };
type DueIndex = Record<string, DueItem>;

export function readIndex(): DueIndex {
  const raw = lsRead(DUE_KEY, {}),
    out: DueIndex = {};
  if (!isRecord(raw)) return out;
  for (const [k, it] of Object.entries(raw)) {
    if (!isRecord(it)) continue;
    const { b, c, d, t, n, bn } = it;
    if (typeof b === 'string' && typeof c === 'string' && typeof d === 'string' && typeof t === 'number')
      out[k] = { b, c, d, t, n: typeof n === 'string' ? n : 'Note', bn: typeof bn === 'string' ? bn : '' };
  }
  return out;
}
// what was already announced: key → the due it was announced for
function readFired(): Record<string, string> {
  const raw = lsRead(DUE_FIRED, {}),
    out: Record<string, string> = {};
  if (isRecord(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

// ---------- slash commands: a list of what Myra can do right here, no thinking needed (typing / opens it; Ctrl+F starts /find) ----------
// ---------- due dates on notes: a chip on the card's bottom edge, a reminder when it comes due ----------
// note.due is "2026-11-04" (the end of that day; the reminder comes at 9:00) or "2026-11-04T15:30". The reminders come from a small index kept in localStorage (every note with a due date, on any board you have opened),
// so nothing needs to open or scan the other boards, and one timer is armed for the next moment that matters: a reminder, a note turning amber (24 hours to go) or red (overdue).
export const DUE_KEY = 'fenmyr:due';
export const DUE_FIRED = 'fenmyr:dueFired';
const DUE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export const lsRead = (k: string, d: unknown): unknown => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null') || d;
  } catch {
    return d;
  }
};
const lsWrite = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};

export function dueDate(d: unknown) {
  if (typeof d !== 'string' || !DUE_RE.test(d)) return null;
  const t = new Date(d.length > 10 ? d : d + 'T23:59');
  return Number.isNaN(t.getTime()) ? null : t;
}

const dueRemindAt = (d: string) => {
  const t = dueDate(d);
  return t && (d.length > 10 ? t : new Date(d + 'T09:00'));
};

export function dueState(d: unknown) {
  const t = dueDate(d);
  if (!t) return '';
  const ms = t.getTime() - Date.now();
  return ms < 0 ? 'over' : ms < 864e5 ? 'soon' : '';
}

export function dueText(d: unknown) {
  const t = dueDate(d);
  if (!t || typeof d !== 'string') return '';
  const day = t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return d.length > 10 ? `${day} · ${t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : day;
}

export const dueChip = (c: Card) => {
  if (c.type !== 'note' || !dueDate(c.due)) return '';
  const state = dueState(c.due),
    when = esc(dueText(c.due)),
    clock = Icon('clock', { size: 12 });
  return `<div class="due ${state}" title="Due ${when}">${clock}<span>${when}</span></div>`;
};

function dueChips() {
  cardsEl.querySelectorAll('.card .due').forEach(ch => {
    const holder = ch.closest('.card'),
      c = holder instanceof HTMLElement ? byId(holder.dataset.id ?? '') : undefined;
    if (c) ch.className = 'due ' + dueState(c.due);
  });
}

export function setDue(c: Card, v: string) {
  remember();
  if (dueDate(v)) c.due = v;
  else delete c.due;
  const el = cardEl(c.id);
  if (el) {
    el.querySelector('.due')?.remove();
    el.insertAdjacentHTML('beforeend', dueChip(c));
  }
  save();
  dueIndex(true);
}

const dueSigs = new Map<string, string>();
let dueT: ReturnType<typeof setTimeout> | undefined;
export const dueHeld: DueItem[] = [];
// dueHold: at start-up reminders wait until the greeting has been said
export function dueIndex(force = false) {
  if (!session.board) return;
  const mine = session.board.cards.filter(c => c.type === 'note' && dueDate(c.due)),
    sig = mine.map(c => `${c.id}|${c.due}|${c.name || c.text || ''}`).join('\n') + '|' + session.board.name;
  if (!force && dueSigs.get(session.board.id) === sig) return;
  dueSigs.set(session.board.id, sig); // saving happens all the time; only a change to the due notes touches the index
  const idx = readIndex();
  for (const [k, it] of Object.entries(idx)) if (it.b === session.board.id) delete idx[k];
  mine.forEach(c => {
    const d = c.due ?? '',
      at = dueRemindAt(d);
    if (!at) return;
    idx[session.board.id + ':' + c.id] = {
      b: session.board.id,
      c: c.id,
      d,
      t: at.getTime(),
      n: String(c.name || c.text || 'Note')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60),
      bn: session.board.name,
    };
  });
  const keys = Object.keys(idx),
    now = Date.now();
  keys.forEach(k => {
    if ((idx[k]?.t ?? 0) < now - 30 * 864e5) delete idx[k];
  }); // a month overdue and long since announced: forget it
  const left = Object.keys(idx);
  if (left.length > 500)
    left
      .sort((a, b) => Math.abs((idx[b]?.t ?? 0) - now) - Math.abs((idx[a]?.t ?? 0) - now))
      .slice(0, left.length - 500)
      .forEach(k => delete idx[k]);
  lsWrite(DUE_KEY, idx);
  dueArm();
}

export function dueForget(boardId: string) {
  const idx = readIndex();
  let n = 0;
  for (const [k, it] of Object.entries(idx))
    if (it.b === boardId) {
      delete idx[k];
      n++;
    }
  dueSigs.delete(boardId);
  if (n) {
    lsWrite(DUE_KEY, idx);
    dueArm();
  }
}

export function dueArm() {
  clearTimeout(dueT);
  const idx = readIndex(),
    fired = readFired(),
    now = Date.now();
  const ready = Object.entries(idx).filter(([k, it]) => it.t <= now && fired[k] !== it.d);
  if (ready.length) {
    ready.forEach(([k, it]) => (fired[k] = it.d));
    Object.keys(fired).forEach(k => {
      if (!idx[k]) delete fired[k];
    });
    lsWrite(DUE_FIRED, fired);
    const its = ready.map(([, it]) => it);
    if (appState.dueHold) dueHeld.push(...its);
    else dueAnnounce(its);
  }
  dueChips();
  let next = Infinity;
  Object.entries(idx).forEach(([k, it]) => {
    const due = dueDate(it.d)?.getTime() ?? 0;
    [fired[k] === it.d ? Infinity : it.t, due - 864e5, due].forEach(t => {
      if (t > now && t < next) next = t;
    });
  });
  if (next < Infinity) dueT = setTimeout(dueArm, Math.min(next - now + 50, 2147e6));
}

export async function dueJump(it: DueItem) {
  if (!session.board || session.board.id !== it.b) {
    closeHome();
    await openBoard(it.b);
  }
  const c = byId(it.c);
  if (c) {
    selectOnly([c.id]);
    showWhatMyraMade([c]);
  } else chirp('That note is no longer on its board ✦', 3500);
}

export function dueAnnounce(items: DueItem[]) {
  const late = (it: DueItem) => Date.now() - it.t > 10 * 6e4,
    where = (it: DueItem) => (session.board && session.board.id === it.b ? '' : ` on “${it.bn}”`);
  const first = items[0];
  if (!first) return;
  if (items.length === 1) {
    const it = first,
      text = `“${it.n}”${where(it)} ${late(it) ? 'was due ' + dueText(it.d) : 'is due now'} ✦`;
    say(text, 0, [{ label: 'Show me', run: () => dueJump(it) }], true);
    osNotify('Due', `${it.n}${where(it)}`);
    return;
  }
  const text =
    `${items.length} notes are due ✦\n` +
    items
      .slice(0, 6)
      .map(it => `• ${it.n}${where(it)}`)
      .join('\n');
  say(text, 0, [{ label: 'Show me', run: () => dueJump(first) }], true);
  osNotify('Due', `${items.length} notes are due`);
}

export function slashDue(arg?: string) {
  const only = (arg || '').trim().toLowerCase(),
    idx = Object.values(readIndex()).sort((a, b) => a.t - b.t),
    now = bdNow(),
    when = (it: DueItem) => dueDate(it.d) ?? new Date(0),
    day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (!idx.length) return reply('Nothing has a due date yet. Pick a note and use the calendar button ✦');
  const over = idx.filter(it => when(it) < now),
    soon = idx.filter(it => when(it) >= now && (only !== 'today' || day(when(it)) === day(now))).slice(0, 8),
    line = (it: DueItem) =>
      `• ${it.n} · ${dueText(it.d)}${session.board && session.board.id === it.b ? '' : ' · ' + it.bn}`;
  const showOver = only !== 'today',
    showSoon = only !== 'overdue';
  if ((!over.length || !showOver) && (!soon.length || !showSoon))
    return reply(
      only === 'overdue'
        ? 'Nothing is overdue ✦'
        : only === 'today'
          ? 'Nothing else is due today ✦'
          : 'Nothing is overdue or coming up ✦',
    );
  const acts = [...(showOver ? over : []).slice(0, 2), ...(showSoon ? soon : []).slice(0, 3)]
    .slice(0, 3)
    .map(it => ({ label: it.n.slice(0, 22), run: () => dueJump(it) }));
  reply(
    (showOver && over.length ? 'Overdue:\n' + over.slice(0, 8).map(line).join('\n') + '\n' : '') +
      (showSoon && soon.length
        ? (only === 'today' ? 'Due today:\n' : 'Coming up:\n') + soon.map(line).join('\n')
        : '') +
      ' ✦',
    0,
    acts,
  );
}
export function init32() {
  appState.dueHold = true;

  addEventListener('focus', () => dueArm());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) dueArm();
  });
}
