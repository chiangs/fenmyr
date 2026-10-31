// @ts-nocheck
import { $ } from '../core/dom.ts';
import { noEmoji, parse, partyMyra } from '../features/timer.ts';
import { card } from '../model/boards.ts';
import { snapshot } from './chat.ts';
import { chatOpen, myraOpen } from './chatWindow.ts';
import { goo } from './goos.ts';
import { idleOK } from './idle.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { reply } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { addCard } from '../tools/penEdit.ts';
import { appState } from '../core/state.ts';

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

export function bdState() {
  try {
    return JSON.parse(localStorage.getItem(BD_KEY) || 'null') || {};
  } catch (e) {
    return {};
  }
}

function saveBd(st) {
  try {
    localStorage.setItem(BD_KEY, JSON.stringify(st));
  } catch (e) {}
}

export function bdNow() {
  return window.__bdNow ? new Date(window.__bdNow) : new Date();
}

export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bdParts() {
  const m = /^(\d\d)-(\d\d)$/.exec(settings.birthday || '');
  return m ? { m: +m[1], d: +m[2] } : null;
}

function bdDate(year) {
  // this year's birthday; February 29 is February 28 in a year without one
  const b = bdParts();
  if (!b) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return new Date(year, b.m - 1, b.m === 2 && b.d === 29 && !leap ? 28 : b.d);
}

export function birthdayDue(now = bdNow()) {
  const st = bdState(),
    y = now.getFullYear(),
    thisYear = bdDate(y);
  if (!thisYear) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    setAt = st.setAt || '0000-00-00';
  if (dayKey(thisYear) === dayKey(today)) return st.last === y ? null : { kind: 'today', year: y, date: thisYear };
  const recent = thisYear <= today ? thisYear : bdDate(y - 1),
    days = Math.round((today - recent) / 86400000);
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

export function setBirthday(m, d) {
  m = +m;
  d = +d;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const next =
    m >= 1 && m <= 12 && d >= 1 && d <= max ? `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  if (next === (settings.birthday || '')) return;
  settings.birthday = next;
  const st = bdState();
  st.setAt = dayKey(bdNow());
  saveBd(st);
  applySettings(); // (the year's celebration, once done, stays done if you change the date)
}

function fillBd(mSel, dSel) {
  mSel.innerHTML =
    '<option value="">Month</option>' + MONTHS.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  dSel.innerHTML =
    '<option value="">Day</option>' +
    Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
}

export function paintBd() {
  const b = bdParts();
  [
    ['setBdMonth', 'setBdDay'],
    ['obBdMonth', 'obBdDay'],
  ].forEach(([a, c]) => {
    if ($(a) && $(a).options.length) {
      $(a).value = b ? b.m : '';
      $(c).value = b ? b.d : '';
    }
  });
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

const attentive = anyway =>
  !!anyway || (focusedNow() && Date.now() - appState.lastActive < 60000 && Date.now() - appState.lastKey > 4000);

const BD_LINES = [
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

const fillName = t =>
  t.replace(/, \{n\}/g, settings.name ? `, ${settings.name}` : '').replace(/\{n\}/g, settings.name || 'friend');

function pickCard(belated) {
  const pool = belated ? BD_BELATED : BD_CARDS,
    st = bdState(),
    last = st.cardIdx != null && st.cardKind === (belated ? 'b' : 'a') ? st.cardIdx : -1;
  let i;
  do {
    i = Math.floor(Math.random() * pool.length);
  } while (pool.length > 1 && (i === last || i === lastCardIdx));
  lastCardIdx = i;
  return { text: fillName(pool[i]), idx: i };
}

async function birthdayLine(due) {
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
  } catch (e) {
    return null;
  }
}

export async function celebrateBirthday(due, demo) {
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
  [500, 2000, 3500].forEach(ms => setTimeout(() => partyMyra(true), ms)); // waves of berry confetti, whatever her calm setting
  const when = due.date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  const canned = belated
    ? `Happy belated birthday${who}! I missed you on ${when}, so I saved the confetti ✦`
    : BD_LINES[Math.floor(Math.random() * BD_LINES.length)](who);
  let ai = await Promise.race([birthdayLine(due), new Promise(r => setTimeout(() => r(null), 2200))]);
  if (typeof ai === 'string') ai = { say: ai };
  reply(noEmoji((ai && ai.say) || canned), 0);
  const picked = ai && ai.card ? null : pickCard(belated),
    words = ai && ai.card ? noEmoji(ai.card) : picked.text;
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

export function birthdayCheck(anyway) {
  syncHat();
  if (celebrating) return false;
  const due = birthdayDue();
  if (!due || !attentive(anyway) || !idleOK(true)) return false;
  celebrateBirthday(due);
  return true;
}

// (temporary, for trying it out) /birthday plays the celebration now; /birthday belated plays the belated one. It stores nothing.
export function slashBirthday(arg) {
  const belated = /^belated/i.test((arg || '').trim()),
    d = new Date();
  if (belated) d.setDate(d.getDate() - 3);
  celebrateBirthday({ kind: belated ? 'belated' : 'today', year: d.getFullYear(), days: 3, date: d }, true);
}
export function init37() {
  [
    ['setBdMonth', 'setBdDay'],
    ['obBdMonth', 'obBdDay'],
  ].forEach(([a, c]) => {
    fillBd($(a), $(c));
    $(a).onchange = $(c).onchange = () => setBirthday($(a).value, $(c).value);
    [$(a), $(c)].forEach(el => el.addEventListener('keydown', e => e.stopPropagation()));
  });

  $('setBdClear').onclick = () => {
    $('setBdMonth').value = $('setBdDay').value = '';
    setBirthday('', '');
  };

  paintBd();

  setInterval(() => birthdayCheck(), 10000);
  addEventListener('focus', () => setTimeout(() => birthdayCheck(), 3000));
  setTimeout(() => birthdayCheck(), 6000);
  syncHat();
}
