// @ts-nocheck
import { cardEl } from '../ui/dom.ts';
import { realBox } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { layersSoon } from '../panels/layers.ts';
import { O } from '../tools/draw.ts';
import { inSection } from './sections.ts';
import { FONTS } from './wireframes.ts';
import { session } from '../core/state.ts';

// ---------- tilt popover: type an exact angle, or pick one ----------
export function setTilt(c, deg, keepPop) {
  if (!c) return;
  remember();
  deg = Math.max(-180, Math.min(180, Math.round(+deg || 0)));
  c.r = deg;
  c.tilted = true;
  renderCard(c);
  selectOnly([c.id]);
  $('selbar').dataset.key = '';
  save();
  const inp = $('tiltPop').querySelector('input');
  if (keepPop && inp && document.activeElement !== inp) inp.value = deg;
  $('tiltPop')
    .querySelectorAll('[data-deg]')
    .forEach(b => b.classList.toggle('on', +b.dataset.deg === deg));
  if (!keepPop) closeTiltPop();
}

export function openTiltPop(c, btn) {
  const pop = $('tiltPop'),
    cur = c.type === 'stamp' && !c.tilted ? 0 : Math.round(c.r || 0);
  pop.innerHTML = `<div class="tp-row"><label class="tp-in"><span>Tilt</span><input type="number" min="-180" max="180" step="1" value="${cur}" aria-label="Tilt in degrees"><b>°</b></label><button class="tp-reset" data-deg="0" title="Straighten it">${Icon('refresh')}Reset</button></div>
      <div class="tp-chips">${[0, 5, 10, 15, 30, 45, 90, -5, -10, -15, -30, -45, -90].map(d => `<button data-deg="${d}" class="${d === cur ? 'on' : ''}">${d}°</button>`).join('')}</div>`;
  const r = btn.getBoundingClientRect();
  pop.classList.add('on');
  pop.style.left =
    Math.min(innerWidth - pop.offsetWidth - 10, Math.max(10, r.left + r.width / 2 - pop.offsetWidth / 2)) + 'px';
  pop.style.top = r.top - pop.offsetHeight - 10 + 'px';
  const inp = pop.querySelector('input');
  setTimeout(() => {
    inp.focus();
    inp.select();
  }, 60); // after the click that opened it has finished
  inp.oninput = () => {
    if (inp.value !== '' && inp.value !== '-') setTilt(c, inp.value, true);
  }; // the card turns as you type
  inp.onkeydown = ev => {
    if (ev.key === 'Enter' || ev.key === 'Escape') {
      ev.preventDefault();
      closeTiltPop();
    }
    ev.stopPropagation();
  };
  pop.onclick = ev => {
    const b = ev.target.closest('[data-deg]');
    if (b) setTilt(c, b.dataset.deg, true);
  };
}

function closeTiltPop() {
  $('tiltPop').classList.remove('on');
}

// the pickers that drop out of the toolbar (shapes, stamps, templates) close when you click anywhere else, and a popup menu (zoom, ···, rows) closes on Esc; one listener each, registered once
const DOCK_PICKS = { shapePick: 'shape', tplPick: 'tpl', stampWheel: 'stamp', stampPick: 'stamp' };
let DOCK_PICK_SEL;

// removing a section pops the bubble but leaves everything that was inside it right where it is
export function removeSection(secs) {
  if (!secs.length) return;
  remember();
  const kids = secs.flatMap(inSection).map(c => c.id),
    gone = new Set(secs.map(c => c.id));
  session.board.cards = session.board.cards.filter(c => !gone.has(c.id));
  secs.forEach(c => cardEl(c.id)?.remove());
  if (session.board.links) session.board.links = session.board.links.filter(l => !gone.has(l.a) && !gone.has(l.b));
  selectOnly(kids);
  renderWires();
  layersSoon();
  save();
}

// what's on a screen: anything whose middle sits inside it
export const onFrame = f => session.board.cards.filter(c => c.id !== f.id && c.type !== 'frame' && c.onFrame === f.id);

export function fileIntoFrame(cs) {
  cs.forEach(c => {
    const mx = c.x + c.w / 2,
      my = c.y + c.h / 2,
      f = [...session.board.cards]
        .reverse()
        .find(f => f.type === 'frame' && f.id !== c.id && mx > f.x && mx < f.x + f.w && my > f.y && my < f.y + f.h);
    if (f) c.onFrame = f.id;
    else delete c.onFrame;
    // landing on a screen that's above it: lift it onto the screen so it doesn't vanish underneath
    if (f && session.board.cards.indexOf(c) < session.board.cards.indexOf(f)) {
      session.board.cards.splice(session.board.cards.indexOf(c), 1);
      session.board.cards.splice(session.board.cards.indexOf(f) + 1, 0, c);
      const el = cardEl(c.id),
        fe = cardEl(f.id);
      if (el && fe) fe.after(el);
    }
  });
}

// snapping: edges and center lines line up with the things around them (any kind), with pink guides
export function snapWF(start, dx, dy) {
  const moving = new Set(start.map(s => s.c.id)),
    mine = start.filter(s => s.c.type !== 'ink').map(s => ({ ...s, c: { ...s.c, ...realBox(s.c) } }));
  $('guides').innerHTML = '';
  if (!mine.length || session.space) return { dx, dy };
  const x0 = Math.min(...mine.map(s => s.x)) + dx,
    y0 = Math.min(...mine.map(s => s.y)) + dy,
    x1 = Math.max(...mine.map(s => s.x + s.c.w)) + dx,
    y1 = Math.max(...mine.map(s => s.y + s.c.h)) + dy;
  const near = 1600 / session.view.z,
    others = session.board.cards
      .filter(
        c =>
          !moving.has(c.id) &&
          c.type !== 'ink' &&
          !c.hidden &&
          Math.abs(c.x - x0) < near &&
          Math.abs(c.y - y0) < near &&
          !parentOf(c.id),
      )
      .map(c => ({ ...c, ...realBox(c) })),
    T = 6 / session.view.z;
  let bx = null,
    by = null;
  const mx = [x0, (x0 + x1) / 2, x1],
    my = [y0, (y0 + y1) / 2, y1];
  others.forEach(o => {
    const ox = [o.x, o.x + o.w / 2, o.x + o.w],
      oy = [o.y, o.y + o.h / 2, o.y + o.h];
    mx.forEach(a =>
      ox.forEach(b => {
        const d = b - a;
        if (Math.abs(d) < T && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: b, o };
      }),
    );
    my.forEach(a =>
      oy.forEach(b => {
        const d = b - a;
        if (Math.abs(d) < T && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at: b, o };
      }),
    );
  });
  let g = '';
  if (bx) {
    dx += bx.d;
    g += `<line x1="${bx.at + O}" y1="${Math.min(y0, bx.o.y) + O - 10}" x2="${bx.at + O}" y2="${Math.max(y1, bx.o.y + bx.o.h) + O + 10}"/>`;
  }
  if (by) {
    dy += by.d;
    g += `<line x1="${Math.min(x0, by.o.x) + O - 10}" y1="${by.at + O}" x2="${Math.max(x1, by.o.x + by.o.w) + O + 10}" y2="${by.at + O}"/>`;
  }
  $('guides').innerHTML = g;
  return { dx, dy };
}

// fonts: use what's on this computer; anything else is fetched from Google Fonts so the real type shows
const fontsLoaded = new Set();

export const isLocalFont = f =>
  FONTS.some(x => x.toLowerCase() === String(f || '').toLowerCase()) || ['Figtree', 'Shantell Sans'].includes(f);

export function useFont(f) {
  if (!f || isLocalFont(f) || fontsLoaded.has(f)) return;
  fontsLoaded.add(f);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700&display=swap`;
  document.head.appendChild(l);
}

// groups: ready-made pieces arrive grouped; Ctrl+G groups a selection, Ctrl+Shift+G ungroups
export const groupOf = id => {
  const g = byId(id)?.group;
  return g ? session.board.cards.filter(c => c.group === g).map(c => c.id) : [id];
};
export function init47() {
  addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && $('tiltPop').classList.contains('on')) {
        closeTiltPop();
        e.stopPropagation();
      }
    },
    true,
  );
  DOCK_PICK_SEL =
    Object.keys(DOCK_PICKS)
      .map(id => '#' + id)
      .join(', ') +
    ', #tools [data-add="shape"], #tools [data-add="stamp"], #tools [data-add="tpl"], #tbMore, #rowMenu';

  addEventListener(
    'pointerdown',
    e => {
      const open = Object.keys(DOCK_PICKS).filter(id => $(id)?.classList.contains('on'));
      if (!open.length || e.target.closest(DOCK_PICK_SEL)) return;
      open.forEach(id => {
        $(id).classList.remove('on');
        $('tools').querySelector(`[data-add="${DOCK_PICKS[id]}"]`)?.classList.remove('on');
      });
    },
    true,
  );

  addEventListener(
    'keydown',
    e => {
      const m = e.key === 'Escape' && $('rowMenu');
      if (m) {
        m.remove();
        e.stopPropagation();
      }
    },
    true,
  );

  addEventListener(
    'pointerdown',
    e => {
      if ($('tiltPop').classList.contains('on') && !e.target.closest('#tiltPop, [data-sb="tiltpop"]')) closeTiltPop();
    },
    true,
  );
}
