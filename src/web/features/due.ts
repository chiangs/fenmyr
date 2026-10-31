// @ts-nocheck
import { esc } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { cardsEl } from '../core/dom.ts';
import { remember, save, showWhatMyraMade } from '../core/history.ts';
import { osNotify } from './timer.ts';
import { closeHome, openBoard } from '../library/home.ts';
import { bdNow } from '../myra/birthday.ts';
import { chirp, reply, say } from '../settings/licenses.ts';
import { appState, session } from '../core/state.ts';

// ---------- slash commands: a list of what Myra can do right here, no thinking needed (typing / opens it; Ctrl+F starts /find) ----------
// ---------- due dates on notes: a chip on the card's bottom edge, a reminder when it comes due ----------
// note.due is "2026-11-04" (the end of that day; the reminder comes at 9:00) or "2026-11-04T15:30". The reminders come from a small index kept in localStorage (every note with a due date, on any board you have opened),
// so nothing needs to open or scan the other boards, and one timer is armed for the next moment that matters: a reminder, a note turning amber (24 hours to go) or red (overdue).
export const DUE_KEY = 'fenmyr:due';
export const DUE_FIRED = 'fenmyr:dueFired';
const DUE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export const lsRead = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) || d;
  } catch (e) {
    return d;
  }
};
const lsWrite = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
};

export function dueDate(d) {
  if (typeof d !== 'string' || !DUE_RE.test(d)) return null;
  const t = new Date(d.length > 10 ? d : d + 'T23:59');
  return isNaN(t) ? null : t;
}

const dueRemindAt = d => {
  const t = dueDate(d);
  return t && (d.length > 10 ? t : new Date(d + 'T09:00'));
};

export function dueState(d) {
  const t = dueDate(d);
  if (!t) return '';
  const ms = t - Date.now();
  return ms < 0 ? 'over' : ms < 864e5 ? 'soon' : '';
}

export function dueText(d) {
  const t = dueDate(d);
  if (!t) return '';
  const day = t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return d.length > 10 ? `${day} · ${t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : day;
}

export const dueChip = c =>
  c.type === 'note' && dueDate(c.due)
    ? `<div class="due ${dueState(c.due)}" title="Due ${esc(dueText(c.due))}">${Icon('clock', { size: 12 })}<span>${esc(dueText(c.due))}</span></div>`
    : '';

function dueChips() {
  cardsEl.querySelectorAll('.card .due').forEach(ch => {
    const c = byId(ch.closest('.card')?.dataset.id);
    if (c) ch.className = 'due ' + dueState(c.due);
  });
}

export function setDue(c, v) {
  remember();
  if (dueDate(v)) c.due = v;
  else delete c.due;
  const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
  if (el) {
    el.querySelector('.due')?.remove();
    el.insertAdjacentHTML('beforeend', dueChip(c));
  }
  save();
  dueIndex(true);
}

let dueSigs = new Map();
let dueT = 0;
export let dueHeld = [];
// dueHold: at start-up reminders wait until the greeting has been said
export function dueIndex(force) {
  if (!session.board) return;
  const mine = session.board.cards.filter(c => c.type === 'note' && dueDate(c.due)),
    sig = mine.map(c => `${c.id}|${c.due}|${c.name || c.text || ''}`).join('\n') + '|' + session.board.name;
  if (!force && dueSigs.get(session.board.id) === sig) return;
  dueSigs.set(session.board.id, sig); // saving happens all the time; only a change to the due notes touches the index
  const idx = lsRead(DUE_KEY, {});
  Object.keys(idx).forEach(k => {
    if (idx[k].b === session.board.id) delete idx[k];
  });
  mine.forEach(c => {
    idx[session.board.id + ':' + c.id] = {
      b: session.board.id,
      c: c.id,
      d: c.due,
      t: dueRemindAt(c.due).getTime(),
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
    if (idx[k].t < now - 30 * 864e5) delete idx[k];
  }); // a month overdue and long since announced: forget it
  const left = Object.keys(idx);
  if (left.length > 500)
    left
      .sort((a, b) => Math.abs(idx[b].t - now) - Math.abs(idx[a].t - now))
      .slice(0, left.length - 500)
      .forEach(k => delete idx[k]);
  lsWrite(DUE_KEY, idx);
  dueArm();
}

export function dueForget(boardId) {
  const idx = lsRead(DUE_KEY, {});
  let n = 0;
  Object.keys(idx).forEach(k => {
    if (idx[k].b === boardId) {
      delete idx[k];
      n++;
    }
  });
  dueSigs.delete(boardId);
  if (n) {
    lsWrite(DUE_KEY, idx);
    dueArm();
  }
}

export function dueArm() {
  clearTimeout(dueT);
  const idx = lsRead(DUE_KEY, {}),
    fired = lsRead(DUE_FIRED, {}),
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
    const due = dueDate(it.d).getTime();
    [fired[k] === it.d ? Infinity : it.t, due - 864e5, due].forEach(t => {
      if (t > now && t < next) next = t;
    });
  });
  if (next < Infinity) dueT = setTimeout(dueArm, Math.min(next - now + 50, 2147e6));
}

export async function dueJump(it) {
  if (!session.board || session.board.id !== it.b) {
    closeHome?.();
    await openBoard(it.b);
  }
  const c = byId(it.c);
  if (c) {
    selectOnly([c.id]);
    showWhatMyraMade([c]);
  } else chirp('That note is no longer on its board ✦', 3500);
}

export function dueAnnounce(items) {
  const late = it => Date.now() - it.t > 10 * 6e4,
    where = it => (session.board && session.board.id === it.b ? '' : ` on “${it.bn}”`);
  if (items.length === 1) {
    const it = items[0],
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
  say(text, 0, [{ label: 'Show me', run: () => dueJump(items[0]) }], true);
  osNotify('Due', `${items.length} notes are due`);
}

export function slashDue(arg) {
  const only = (arg || '').trim().toLowerCase(),
    idx = Object.values(lsRead(DUE_KEY, {})).sort((a, b) => a.t - b.t),
    now = bdNow(),
    day = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (!idx.length) return reply('Nothing has a due date yet. Pick a note and use the calendar button ✦');
  const over = idx.filter(it => dueDate(it.d) < now),
    soon = idx.filter(it => dueDate(it.d) >= now && (only !== 'today' || day(dueDate(it.d)) === day(now))).slice(0, 8),
    line = it => `• ${it.n} · ${dueText(it.d)}${session.board && session.board.id === it.b ? '' : ' · ' + it.bn}`;
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
