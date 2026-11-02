import { esc } from '../ui/dom.ts';
import { $, stage } from '../core/dom.ts';
import { card } from '../model/boards.ts';
import { addCard } from './penEdit.ts';
import { mouse, startPlacing } from './place.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';
import { isRecord } from '../../shared/model.ts';

// a stamp: one of Myra's pictures (src) or an emoji, maybe moving (mv); n is its name in the picker
export type Stamp = { n?: string; src?: string; emoji?: string; mv?: string };
const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
// the wheel as saved: eight stamps, or nothing usable
function readWheel(raw: unknown): Stamp[] | null {
  if (!Array.isArray(raw) || raw.length !== 8) return null;
  return raw.filter(isRecord).map(s => {
    const st: Stamp = {},
      src = text(s.src),
      emoji = text(s.emoji),
      mv = text(s.mv);
    if (src) st.src = src;
    if (emoji) st.emoji = emoji;
    if (mv) st.mv = mv;
    return st;
  });
}

// ---------- stamps: Myra's emojis, moving Myras and regular emoji, stamped with a little burst ----------
const M = (n: string) => 'stamps/myra' + (n ? '-' + n : '') + '.png';
let STAMPS: Record<string, Stamp[]> = {};
let wheel: Stamp[] = [];

// Myra's own pixel stamps (drawn by assets/art/make_art.py); every other emoji shows as your system's emoji until it has one
const PX: Record<string, string> = {
  '❤️': 'heart',
  '⭐': 'star',
  '✨': 'sparkles',
  '🌈': 'rainbow',
  '🔥': 'fire',
  '✅': 'check',
  '❌': 'cross',
  '❓': 'question',
  '❗': 'exclaim',
  '💡': 'bulb',
  '💙': 'blueheart',
  '🌸': 'blossom',
  '☕': 'coffee',
  '📌': 'pushpin',
  '🎯': 'target',
  '💬': 'speech',
};

export const pxSrc = (e: string) => (PX[e] ? `stamps/px/${PX[e]}.png` : null);

export const stampHTML = (st: Stamp) => {
  const px = pxSrc(st.emoji ?? ''),
    src = esc(st.src),
    emoji = esc(st.emoji);
  return st.src ? `<img src="${src}" alt="">` : px ? `<img src="${px}" alt="${emoji}">` : emoji;
};

export function renderWheel() {
  $('wsRing').innerHTML = wheel
    .map((st, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2,
        x = 110 + Math.cos(a) * 76,
        y = 110 + Math.sin(a) * 76;
      const moves = st.mv ? 'mv-' + st.mv : '',
        pic = stampHTML(st);
      return `<button data-w="${i}" class="${moves}" style="left:${x}px;top:${y}px">${pic}</button>`;
    })
    .join('');
}

function renderPick(tab = 'myra') {
  for (const b of htmlIn($('stampPick'), '[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  $('spGrid').innerHTML = (STAMPS[tab] ?? [])
    .map((st, i) => {
      const name = esc(st.n),
        moves = st.mv ? 'mv-' + st.mv : '',
        pic = stampHTML(st);
      return `<button data-p="${tab}:${i}" title="${name}" class="${moves}">${pic}</button>`;
    })
    .join('');
}

const pickStamp = (st: Stamp | undefined) => {
  if (!st) return;
  $('stampWheel').classList.remove('on');
  $('stampPick').classList.remove('on');
  startPlacing('stamp', { stamp: st });
  $('tools').querySelector('[data-add="stamp"]')?.classList.add('on');
};

export function stampAt(w: { x: number; y: number }, st: Stamp) {
  const c = card('stamp', { src: st.src, emoji: st.emoji, mv: st.mv, r: Math.round(Math.random() * 16 - 8) });
  c.x = w.x - 28;
  c.y = w.y - 28;
  addCard(c);
  const r = stage.getBoundingClientRect(),
    b = document.createElement('div');
  b.className = 'burst';
  b.style.left = mouse.x - r.left + 'px';
  b.style.top = mouse.y - r.top + 'px';
  b.innerHTML = [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<i style="--a:${a}deg"></i>`).join('');
  stage.appendChild(b);
  setTimeout(() => b.remove(), 500);
}
export function init51() {
  STAMPS = {
    myra: [
      ['Myra', M('')],
      ['Happy', M('happy')],
      ['Love', M('love')],
      ['Party', M('party')],
      ['Wave', M('wave')],
      ['Shook', M('shook')],
      ['Sleepy', M('sleepy')],
      ['Cry', M('cry')],
      ['Sigh', M('sigh')],
    ].map(([n = '', src = '']) => ({ n, src })),
    moving: [
      { n: 'Bounce', src: 'stamps/myra-bounce.gif' },
      { n: 'Sigh', src: 'stamps/myra-sigh.gif' },
      { n: 'Hi!', src: M('wave'), mv: 'wiggle' },
      { n: 'Love', src: M('love'), mv: 'pulse' },
      { n: 'Party', src: M('party'), mv: 'spin' },
      { n: 'Shook', src: M('shook'), mv: 'shake' },
      { n: 'Sleepy', src: M('sleepy'), mv: 'float' },
      { n: 'Happy', src: M('happy'), mv: 'squish' },
      { n: 'Hop', src: M(''), mv: 'hop' },
    ],
    emoji: [
      ...'❤️ 👍 👎 ⭐ ✨ 🌈 🔥 🎉 💯 ✅ ❌ ❓ ❗ 💡 👀 🙌 👏 🤔 😍 😂 🥹 😭 😅 🫶 💖 🩷 💜 💙 🌸 🌷 🍓 🍑 🧁 ☕ 🚀 📌 📍 🎯 🏆 🧠 💬 🗓️ ⏰ 🔗 🎨 🖍️ 📸 🎧'.split(
        ' ',
      ),
    ].map(e => ({ n: e, emoji: e })),
  };

  // from the top, clockwise: Myra, thumbs up, thumbs down, Myra in love, a look, a question, a red cross, a green check
  const WHEEL_DEFAULT: Stamp[] = [
    { src: 'stamps/myra-bounce.gif' },
    { emoji: '👍' },
    { emoji: '👎' },
    { src: M('love'), mv: 'pulse' },
    { emoji: '👀' },
    { emoji: '❓' },
    { emoji: '❌' },
    { emoji: '✅' },
  ];

  // the wheel keeps your favorites; anything you pick from the full list joins it
  wheel = WHEEL_DEFAULT;
  try {
    wheel = readWheel(JSON.parse(localStorage.getItem('fenmyr:wheel') || 'null')) ?? WHEEL_DEFAULT;
  } catch {}

  $('wsRing').onclick = e => {
    const b = closestTo(e.target, '[data-w]');
    if (b) pickStamp(wheel[Number(b.dataset.w)]);
  };

  $('wsMid').onclick = () => {
    $('stampWheel').classList.remove('on');
    renderPick();
    $('stampPick').classList.add('on');
  };

  $('stampPick').onclick = e => {
    const t = closestTo(e.target, '[data-tab]');
    if (t) return renderPick(t.dataset.tab);
    const b = closestTo(e.target, '[data-p]');
    if (!b) return;
    const [tab = '', i] = (b.dataset.p ?? '').split(':'),
      st = STAMPS[tab]?.[Number(i)];
    if (!st) return;
    const clean: Stamp = {
      ...(st.src ? { src: st.src } : {}),
      ...(st.emoji ? { emoji: st.emoji } : {}),
      ...(st.mv ? { mv: st.mv } : {}),
    };
    if (!wheel.some(w2 => w2.src === clean.src && w2.emoji === clean.emoji && w2.mv === clean.mv)) {
      wheel = [clean, ...wheel].slice(0, 8);
      try {
        localStorage.setItem('fenmyr:wheel', JSON.stringify(wheel));
      } catch (e2) {}
    }
    pickStamp(clean);
  };

  ['stampWheel', 'stampPick'].forEach(id => $(id).addEventListener('pointerdown', e => e.stopPropagation()));
}
