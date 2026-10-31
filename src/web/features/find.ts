// @ts-nocheck
import { esc } from '../ui/dom.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { find, hasAll, queryWords } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { applyDim } from './focus.ts';
import { cleanTag } from './tags.ts';
import { timer } from './timer.ts';
import { ANIMS } from '../myra/anim.ts';
import { addMsg } from '../myra/chat.ts';
import { chatOpen, myraOpen } from '../myra/chatWindow.ts';
import { SLASH, glideTo, helpText, wordsOf } from '../myra/greet.ts';
import { reply } from '../settings/licenses.ts';
import { session } from '../core/state.ts';

// ---------- the find bar: opens next to Myra when /find or /tag runs; searches as you type, steps through the matches, closes with Esc ----------
const readingOrder = (a, b) => Math.round(a.y / 90) - Math.round(b.y / 90) || a.x - b.x;

function findRun(keep) {
  const words = queryWords($('fbQ').value);
  find.hits = words.length
    ? session.board.cards.filter(c => !c.hidden && hasAll(words, wordsOf(c))).sort(readingOrder)
    : [];
  find.i = keep && find.i < find.hits.length ? find.i : 0;
  find.cur = find.hits[find.i]?.id || null;
  find.set = find.hits.length ? new Set(find.hits.map(c => c.id)) : null;
  const tray = words.length ? session.board.tray.filter(c => hasAll(words, wordsOf(c))).length : 0;
  $('fbCount').textContent = !words.length
    ? 'Type to find'
    : find.hits.length
      ? `${find.i + 1} of ${find.hits.length}` + (tray ? ` · +${tray} in Unsorted` : '')
      : tray
        ? `${tray} in Unsorted`
        : 'No matches';
  $('fbCount').classList.toggle('none', !!words.length && !find.hits.length);
  $('fbPrev').disabled = $('fbNext').disabled = find.hits.length < 2;
  applyDim();
  if (find.cur) glideTo([byId(find.cur)]);
  findFit();
  return find.hits.length;
}

function findStep(d) {
  if (find.hits.length < 2) return;
  find.i = (find.i + d + find.hits.length) % find.hits.length;
  findRun(true);
}

function findOpen(query = '') {
  find.on = true;
  myraOpen(false);
  selectOnly([]);
  $('findBar').hidden = false;
  $('fbQ').value = query;
  const n = findRun(false);
  $('fbQ').focus();
  $('fbQ').select();
  return n;
}

export function findClose(keep) {
  if (!find.on) return;
  if (keep && find.cur && byId(find.cur)) selectOnly([find.cur]);
  find.on = false;
  find.set = find.cur = null;
  find.hits = [];
  $('findBar').hidden = true;
  findFit();
  applyDim();
}

let findT = 0;

// the bar always sits right of Myra's pill. When the toolbar leaves no room for it, the toolbar steps aside while you search (a very narrow window puts the bar just above her instead)
function findFit() {
  const b = $('findBar'),
    d = $('dock'),
    over = () => b.getBoundingClientRect().right > innerWidth - 12;
  d.classList.remove('finding');
  b.classList.remove('up');
  if (b.hidden) return;
  if (over()) {
    d.classList.add('finding');
    if (over()) b.classList.add('up');
  }
}

export function slashFind(arg) {
  const q = arg.trim();
  if (!q) {
    findOpen();
    return reply('Type what to look for in the bar next to me ✦');
  }
  const n = findOpen(q);
  reply(
    n
      ? `Found ${n} ${n === 1 ? 'card' : 'cards'} for “${q}”. Step through them with the bar next to me ✦`
      : `Nothing for “${q}”.`,
  );
}

export function slashTag(arg) {
  const t = cleanTag(arg).toLowerCase(),
    all = session.board.tags || [];
  if (!t)
    return reply(
      all.length
        ? 'Tags on this board: ' +
            all
              .map(
                x =>
                  `#${x} (${session.board.cards.filter(c => (c.tags || []).some(y => y.toLowerCase() === x.toLowerCase())).length})`,
              )
              .join(', ') +
            '. Try /tag ' +
            all[0] +
            ' ✦'
        : 'No tags on this board yet. Type # in a note to add one ✦',
    );
  const n = findOpen('#' + t);
  reply(
    n
      ? `Found ${n} ${n === 1 ? 'card' : 'cards'} tagged #${t}. Step through them with the bar next to me ✦`
      : `Nothing tagged #${t}.`,
  );
}

export function slash(text) {
  if (!session.board) return;
  if (!chatOpen()) myraOpen(true);
  const m = /^\/(\w*)\s*(.*)$/s.exec(text.trim()),
    c = m && SLASH.find(x => x.cmd === m[1].toLowerCase());
  if (!c) {
    addMsg('me', text);
    return reply(helpText(`I don't know /${m ? m[1] : ''}. Here is what I can do:`));
  }
  if (!c.quiet) addMsg('me', text);
  c.run(m[2]);
}

let slashSel = 0;
let slashMenu;

export const hideSlash = () => {
  slashMenu.hidden = true;
};

// the menu lists commands; typing just /timer lists ready-made timers instead
const TIMER_PRESETS = [
  { fill: '/timer 15 break', title: '15 min break', desc: 'A short break' },
  { fill: '/timer 50 focus', title: '50 min focus', desc: 'A long stretch of focus' },
  { fill: '/timer 5 breather', title: '5 min breather', desc: 'Stand up, look away, stretch' },
];

const slashMatches = el => {
  if (/^\/timer\s*$/i.test(el.value) && !timer)
    return TIMER_PRESETS.map(p => ({
      key: p.fill,
      title: `<b>/timer</b> ${esc(p.title)}`,
      desc: p.desc,
      fill: p.fill,
    }));
  if (/^\/animate\s*$/i.test(el.value))
    return [
      { key: '/animate', title: '<b>/animate</b> Surprise me', desc: 'A random one', fill: '/animate' },
      ...ANIMS.map(a => ({
        key: '/animate ' + a.name,
        title: `<b>/animate</b> ${a.name}`,
        desc: a.desc,
        fill: '/animate ' + a.name,
      })),
    ];
  const m = /^\/(\w*)$/.exec(el.value);
  return m
    ? SLASH.filter(c => c.cmd.startsWith(m[1].toLowerCase())).map(c => ({
        key: c.cmd,
        title: `<b>/${c.cmd}${c.arg ? ` <i>${esc(c.arg)}</i>` : ''}</b>`,
        desc: c.desc,
        cmd: c,
      }))
    : [];
};

function showSlash(el) {
  const list = slashMatches(el);
  if (!list.length) return hideSlash();
  slashSel = Math.min(slashSel, list.length - 1);
  slashMenu.innerHTML = list
    .map(
      (c, i) =>
        `<button type="button" data-key="${esc(c.key)}" class="${i === slashSel ? 'on' : ''}">${c.title}<span>${esc(c.desc)}</span></button>`,
    )
    .join('');
  const r = (el.closest('form') || el).getBoundingClientRect();
  slashMenu.hidden = false;
  slashMenu.style.left = r.left + 'px';
  slashMenu.style.width = Math.max(260, r.width) + 'px';
  slashMenu.style.bottom = innerHeight - r.top + 6 + 'px';
  slashMenu.dataset.for = el.id;
}

function pickSlash(key) {
  const el = $(slashMenu.dataset.for),
    it = el && slashMatches(el).find(x => x.key === key);
  hideSlash();
  if (!it) return;
  if (it.fill) {
    el.value = it.fill;
    el.closest('form').requestSubmit();
    return;
  }
  const c = it.cmd;
  el.value = '/' + c.cmd + (c.arg ? ' ' : '');
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
  if (!c.arg) el.closest('form').requestSubmit();
  else {
    slashSel = 0;
    showSlash(el);
  } // /timer then lists its ready-made timers
}

// Ctrl+F: Myra's chat opens ready to search
export function startFind() {
  if (!session.board) return;
  if (find.on) {
    $('fbQ').focus();
    $('fbQ').select();
    return;
  }
  myraOpen(true);
  const el = $('mcInput'),
    had = /^\/find /i.test(el.value);
  if (!had) el.value = '/find ';
  el.focus();
  el.dispatchEvent(new Event('input'));
  had ? el.setSelectionRange(6, el.value.length) : el.setSelectionRange(el.value.length, el.value.length);
}
export function init34() {
  $('fbQ').addEventListener('input', () => {
    clearTimeout(findT);
    findT = setTimeout(() => findRun(false), 120);
  });

  $('fbQ').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(findT);
      findStep(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Escape') findClose(true);
  });

  $('fbNext').onclick = () => findStep(1);
  $('fbPrev').onclick = () => findStep(-1);
  $('fbX').onclick = () => findClose(true);

  addEventListener('resize', () => {
    if (find.on) findFit();
  });

  slashMenu = document.createElement('div');
  slashMenu.className = 'slash-menu';
  slashMenu.hidden = true;
  document.body.appendChild(slashMenu);

  slashMenu.addEventListener('pointerdown', e => e.preventDefault());
  // keep the focus in the box
  slashMenu.onclick = e => {
    const b = e.target.closest('[data-key]');
    if (b) pickSlash(b.dataset.key);
  };

  ['mInput', 'mcInput'].forEach(id => {
    const el = $(id);
    el.addEventListener('input', () => {
      slashSel = 0;
      showSlash(el);
    });
    el.addEventListener('blur', () =>
      setTimeout(() => {
        if (document.activeElement !== el) hideSlash();
      }, 120),
    ); // (not if it has the cursor again by then)
    el.addEventListener(
      'keydown',
      e => {
        if (slashMenu.hidden || slashMenu.dataset.for !== id) return;
        const list = slashMatches(el);
        if (e.key === 'Escape') {
          e.stopImmediatePropagation();
          e.preventDefault();
          return hideSlash();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopImmediatePropagation();
          slashSel = (slashSel + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
          return showSlash(el);
        }
        if (
          (e.key === 'Enter' || e.key === 'Tab') &&
          !e.shiftKey &&
          list[slashSel] &&
          !(
            e.key === 'Enter' &&
            list[slashSel].cmd &&
            el.value.slice(1).toLowerCase() === list[slashSel].cmd.cmd &&
            !list[slashSel].cmd.arg
          )
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          pickSlash(list[slashSel].key);
        }
      },
      true,
    );
  });
}
