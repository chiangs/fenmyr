import { isRecord } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { partyMyra } from '../features/timer.ts';
import { card } from '../model/boards.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { addCard } from '../tools/penEdit.ts';
import { elementById } from '../ui/dom.ts';
import { snapshot } from './chat.ts';
import { chatOpen, myraOpen } from './chatWindow.ts';
import { goo } from './goos.ts';
import { idleOK } from './idle.ts';
import { noEmoji, parse } from './replyText.ts';
import { reply } from './say.ts';

// last: the year she last celebrated; hat: the day she wears it; setAt: the day the birthday was set;
// card, cardIdx, cardKind: the card she left last time, so the next one is different
type BdState = { last?: number; hat?: string; setAt?: string; card?: string; cardIdx?: number; cardKind?: string };
export type BirthdayDue = { kind: 'today' | 'belated'; year: number; date: Date; days?: number };
export type BirthdayLine = { say: string | null; card: string | null } | null;
const select = (id: string) => elementById(id, HTMLSelectElement);
const PAIRS: [month: string, day: string][] = [
  ['setBdMonth', 'setBdDay'],
  ['obBdMonth', 'obBdDay'],
];

// ---------- birthday: set in Settings (or at setup), kept as month and day only. On the day Myra celebrates once you are really there (the window focused, you active in the last minute, not mid-sentence). Miss it and she wishes you a belated one for up to 14 days ----------
const BD_KEY = 'fenmyr:birthday';
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function bdState(): BdState {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(BD_KEY) || 'null');
  } catch {}
  if (!isRecord(raw)) return {};
  const st: BdState = {};
  if (typeof raw.last === 'number') st.last = raw.last;
  if (typeof raw.cardIdx === 'number') st.cardIdx = raw.cardIdx;
  for (const k of ['hat', 'setAt', 'card', 'cardKind'] as const) {
    const v = raw[k];
    if (typeof v === 'string') st[k] = v;
  }
  return st;
}

function saveBd(st: BdState) {
  try {
    localStorage.setItem(BD_KEY, JSON.stringify(st));
  } catch (_e) {}
}

export function bdNow() {
  return window.__bdNow ? new Date(window.__bdNow) : new Date();
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bdParts() {
  const m = /^(\d\d)-(\d\d)$/.exec(settings.birthday || '');
  return m ? { m: Number(m[1]), d: Number(m[2]) } : null;
}

function bdDate(year: number) {
  // this year's birthday; February 29 is February 28 in a year without one
  const b = bdParts();
  if (!b) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return new Date(year, b.m - 1, b.m === 2 && b.d === 29 && !leap ? 28 : b.d);
}

export function birthdayDue(now = bdNow()): BirthdayDue | null {
  const st = bdState(),
    y = now.getFullYear(),
    thisYear = bdDate(y);
  if (!thisYear) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    setAt = st.setAt || '0000-00-00';
  if (dayKey(thisYear) === dayKey(today)) return st.last === y ? null : { kind: 'today', year: y, date: thisYear };
  const recent = thisYear <= today ? thisYear : bdDate(y - 1);
  if (!recent) return null;
  const days = Math.round((today.getTime() - recent.getTime()) / 86400000);
  // belated: within 14 days, not already celebrated, and only for a birthday that was set before it came round (not one you typed in afterwards)
  return days >= 1 && days <= 14 && st.last !== recent.getFullYear() && dayKey(recent) >= setAt
    ? { kind: 'belated', year: recent.getFullYear(), days, date: recent }
    : null;
}

export function birthdayFacts() {
  // what she is told about it: the day, and whether it is today
  const b = bdParts();
  if (!b) return undefined;
  const d = bdDate(bdNow().getFullYear());
  return { birthday: `${MONTHS[b.m - 1]} ${b.d}`, birthdayToday: !!d && dayKey(d) === dayKey(bdNow()) };
}

export function setBirthday(month: string | number, day: string | number) {
  const m = Number(month),
    d = Number(day);
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
  const next =
    m >= 1 && m <= 12 && d >= 1 && d <= max ? `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  if (next === (settings.birthday || '')) return;
  settings.birthday = next;
  const st = bdState();
  st.setAt = dayKey(bdNow());
  saveBd(st);
  applySettings(); // (the year's celebration, once done, stays done if you change the date)
}

function fillBd(mSel: HTMLSelectElement, dSel: HTMLSelectElement) {
  mSel.innerHTML =
    '<option value="">Month</option>' +
    MONTHS.map((n, i) => {
      const v = i + 1;
      return `<option value="${v}">${n}</option>`;
    }).join('');
  dSel.innerHTML =
    '<option value="">Day</option>' +
    Array.from({ length: 31 }, (_, i) => {
      const d = i + 1;
      return `<option value="${d}">${d}</option>`;
    }).join('');
}

export function paintBd() {
  const b = bdParts();
  for (const [a, c] of PAIRS) {
    if (select(a).options.length) {
      select(a).value = b ? String(b.m) : '';
      select(c).value = b ? String(b.d) : '';
    }
  }
}

// she wears the hat all day, once she has celebrated
export let hatOn = false;
let celebrating = false;
let hatDemoUntil = 0;

function syncHat() {
  const on = bdState().hat === dayKey(bdNow()) || Date.now() < hatDemoUntil;
  if (on !== hatOn) {
    hatOn = on;
    goo.hat(on);
  }
}

// paying attention: the window is focused, there was real input in the last minute, and nothing was typed in the last few seconds; and nothing else is going on with her
const focusedNow = () => window.__bdFocus ?? (!document.hidden && document.hasFocus());

const attentive = (anyway?: boolean) =>
  !!anyway || (focusedNow() && Date.now() - appState.lastActive < 60000 && Date.now() - appState.lastKey > 4000);

const BD_LINES: ((who: string) => string)[] = [
  who => `Happy birthday${who}! I put on my best hat for you ✦`,
  who => `It's your birthday${who}! Berries for everyone ✦`,
  who => `Happy birthday${who}! The board can wait a little today ✦`,
];

// the card she leaves on the board: warm, a little dry, like a birthday card. With thinking off these are the pool (a different one each time, never the last one twice); with it on she writes a fresh one.
const BD_CARDS = [
  'Another year older, {n}, and still the best reason this board gets anything done. Cake first, tidying later.',
  'Happy birthday, {n}. I would light the candles myself, but I am mostly fruit and the cake is flammable.',
  "You are not getting older, {n}. You are ripening. I'd know.",
  "Today's agenda, {n}: cake, nothing urgent, and at least one person singing badly on your behalf.",
  'Happy birthday, {n}. The backlog has been told it can wait. It did not argue.',
  'Another lap around the sun, {n}. Excellent form, no notes.',
  'Many happy returns, {n}. I am not accepting any returns today, only cake.',
  'Happy birthday, {n}. Cake counts as a project plan today. I checked.',
  "I'd say you don't look a day older, {n}, but I only see you through a screen, so who knows. Happy birthday.",
  'Happy birthday, {n}. I made this card myself. It took a while, mostly the glitter.',
  'Happy birthday, {n}. Whatever you wished for, I have already put it in the backlog.',
  'Another year, {n}, and the board still has you. It could do worse. Happy birthday.',
];

const BD_BELATED = [
  'Happy belated birthday, {n}. I am told the best presents arrive late. This card is the present.',
  'Belated happy birthday, {n}. The confetti took the scenic route.',
  'Happy belated birthday, {n}. I missed the day, not the cake. Where is the cake.',
  'Late, {n}, but sincere: happy birthday. I blame the clouds.',
  "Happy belated birthday, {n}. Consider it a birthday that's still in the post.",
  'You get a second round of birthday, {n}. Happy belated. Terms and conditions do not apply.',
];

let lastCardIdx = -1;

const fillName = (t: string) =>
  t.replace(/, \{n\}/g, settings.name ? `, ${settings.name}` : '').replace(/\{n\}/g, settings.name || 'friend');

function pickCard(belated: boolean) {
  const pool = belated ? BD_BELATED : BD_CARDS,
    st = bdState(),
    last = st.cardIdx != null && st.cardKind === (belated ? 'b' : 'a') ? st.cardIdx : -1;
  let i: number;
  do {
    i = Math.floor(Math.random() * pool.length);
  } while (pool.length > 1 && (i === last || i === lastCardIdx));
  lastCardIdx = i;
  return { text: fillName(pool[i] ?? ''), idx: i };
}

async function birthdayLine(due: BirthdayDue): Promise<BirthdayLine> {
  // with thinking on, a greeting and a card written for the moment; otherwise (or if it is slow) null and the written ones are used
  if (window.__birthdayLineStub) return window.__birthdayLineStub(due);
  if (Fenmyr.web || !settings.ai || appState.haveClaude === false || !navigator.onLine) return null;
  const last = bdState().card,
    prompt = `(This is a birthday notice, not a request. ${due.kind === 'belated' ? `The person's birthday was ${due.days} day${due.days === 1 ? '' : 's'} ago and you missed it, so wish them a happy belated birthday` : "It is the person's birthday today, so wish them a happy birthday"}. Reply with "say": one short, warm line in your own voice for the chat, and "card": the words for a birthday card you will leave on their board: one or two short sentences, warm with a little dry humour like a good birthday card, addressed to them, never telling them what to do with the card. ${last ? `The card you left last time said: "${String(last).slice(0, 200)}", so write something different. ` : ''}Do not change the board.)`;
  try {
    const raw = await Promise.race([
      Fenmyr.ask(
        prompt,
        { ...snapshot(), cards: [], links: [], unsorted: [], recentChat: [], commands: undefined },
        false,
        { mobbin: false, higgs: false, web: false, canVault: false, vaultNotes: [] },
      ),
      new Promise((_, no) => setTimeout(() => no(new Error('slow')), 6000)),
    ]);
    const r = parse(raw);
    return {
      say: r.say || null,
      card: typeof r.card === 'string' && r.card.trim() ? r.card.trim().slice(0, 240) : null,
    };
  } catch (_e) {
    return null;
  }
}

export async function celebrateBirthday(due: BirthdayDue, demo = false) {
  celebrating = true;
  const who = settings.name ? `, ${settings.name}` : '',
    belated = due.kind === 'belated';
  if (!demo) {
    const st = bdState();
    st.last = due.year;
    st.hat = dayKey(bdNow());
    saveBd(st);
  }
  if (demo) hatDemoUntil = Date.now() + 90000; // (the demo's hat lasts a minute and a half)
  hatOn = true;
  goo.hat(true);
  if (!chatOpen()) myraOpen(true);
  [500, 2000, 3500].forEach(ms => {
    setTimeout(() => partyMyra(true), ms);
  }); // waves of berry confetti, whatever her calm setting
  const when = due.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const canned = belated
    ? `Happy belated birthday${who}! I missed you on ${when}, so I saved the confetti ✦`
    : (BD_LINES[Math.floor(Math.random() * BD_LINES.length)]?.(who) ?? '');
  const ai = await Promise.race([birthdayLine(due), new Promise<BirthdayLine>(r => setTimeout(() => r(null), 2200))]);
  reply(noEmoji(ai?.say || canned), 0);
  const picked = ai?.card ? null : pickCard(belated),
    words = ai?.card ? noEmoji(ai.card) : (picked?.text ?? '');
  if (!demo) {
    const st = bdState();
    st.card = words;
    if (picked) {
      st.cardIdx = picked.idx;
      st.cardKind = belated ? 'b' : 'a';
    }
    saveBd(st);
  }
  const p = centerWorld(),
    title = belated ? 'Happy belated birthday' : 'Happy birthday',
    c = card('note', {
      myra: true,
      myraImg: 'stamps/myra-party.png',
      myraMv: 'spin',
      name: title,
      text: words,
      color: 'butter',
      w: 260,
      h: 190,
    });
  c.x = p.x - c.w / 2;
  c.y = p.y - c.h / 2 - 40;
  addCard(c);
  celebrating = false;
}

export function birthdayCheck(anyway?: boolean) {
  syncHat();
  if (celebrating) return false;
  const due = birthdayDue();
  if (!due || !attentive(anyway) || !idleOK(true)) return false;
  celebrateBirthday(due);
  return true;
}

// (temporary, for trying it out) /birthday plays the celebration now; /birthday belated plays the belated one. It stores nothing.
export function slashBirthday(arg?: string) {
  const belated = /^belated/i.test((arg || '').trim()),
    d = new Date();
  if (belated) d.setDate(d.getDate() - 3);
  celebrateBirthday({ kind: belated ? 'belated' : 'today', year: d.getFullYear(), days: 3, date: d }, true);
}
export function init37() {
  for (const [a, c] of PAIRS) {
    const month = select(a),
      day = select(c);
    fillBd(month, day);
    month.onchange = day.onchange = () => setBirthday(month.value, day.value);
    for (const el of [month, day]) el.addEventListener('keydown', e => e.stopPropagation());
  }

  $('setBdClear').onclick = () => {
    select('setBdMonth').value = select('setBdDay').value = '';
    setBirthday('', '');
  };

  paintBd();

  setInterval(() => birthdayCheck(), 10000);
  addEventListener('focus', () => setTimeout(() => birthdayCheck(), 3000));
  setTimeout(() => birthdayCheck(), 6000);
  syncHat();
}
