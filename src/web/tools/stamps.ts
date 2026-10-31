// @ts-nocheck
import { esc } from '../canvas/render.ts';
import { $, stage } from '../core/dom.ts';
import { card } from '../model/boards.ts';
import { addCard } from './penEdit.ts';
import { mouse, startPlacing } from './place.ts';

// ---------- stamps: Myra's emojis, moving Myras and regular emoji, stamped with a little burst ----------
const M = n => 'stamps/myra' + (n ? '-' + n : '') + '.png';
let STAMPS;
let WHEEL_DEFAULT;
let wheel;

// Myra's own pixel stamps (drawn by assets/art/make_art.py); every other emoji shows as your system's emoji until it has one
const PX = {
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

export const pxSrc = e => (PX[e] ? `stamps/px/${PX[e]}.png` : null);

export const stampHTML = st =>
  st.src
    ? `<img src="${esc(st.src)}" alt="">`
    : pxSrc(st.emoji)
      ? `<img src="${pxSrc(st.emoji)}" alt="${esc(st.emoji)}">`
      : esc(st.emoji);

export function renderWheel() {
  $('wsRing').innerHTML = wheel
    .map((st, i) => {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2,
        x = 110 + Math.cos(a) * 76,
        y = 110 + Math.sin(a) * 76;
      return `<button data-w="${i}" class="${st.mv ? 'mv-' + st.mv : ''}" style="left:${x}px;top:${y}px">${stampHTML(st)}</button>`;
    })
    .join('');
}

function renderPick(tab = 'myra') {
  $('stampPick')
    .querySelectorAll('[data-tab]')
    .forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('spGrid').innerHTML = STAMPS[tab]
    .map(
      (st, i) =>
        `<button data-p="${tab}:${i}" title="${esc(st.n)}" class="${st.mv ? 'mv-' + st.mv : ''}">${stampHTML(st)}</button>`,
    )
    .join('');
}

const pickStamp = st => {
  $('stampWheel').classList.remove('on');
  $('stampPick').classList.remove('on');
  startPlacing('stamp', { stamp: st });
  $('tools').querySelector('[data-add="stamp"]').classList.add('on');
};

export function stampAt(w, st) {
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
    ].map(([n, src]) => ({ n, src })),
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
  WHEEL_DEFAULT = [
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
    const w0 = JSON.parse(localStorage.getItem('fenmyr:wheel') || 'null');
    if (Array.isArray(w0) && w0.length === 8) wheel = w0;
  } catch (e) {}

  $('wsRing').onclick = e => {
    const b = e.target.closest('[data-w]');
    if (b) pickStamp(wheel[+b.dataset.w]);
  };

  $('wsMid').onclick = () => {
    $('stampWheel').classList.remove('on');
    renderPick();
    $('stampPick').classList.add('on');
  };

  $('stampPick').onclick = e => {
    const t = e.target.closest('[data-tab]');
    if (t) return renderPick(t.dataset.tab);
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const [tab, i] = b.dataset.p.split(':'),
      st = STAMPS[tab][+i],
      clean = { src: st.src, emoji: st.emoji, mv: st.mv };
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
