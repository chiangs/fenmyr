// @ts-nocheck
import { applyGridShape } from '../canvas/gridShape.ts';
import { COLORS, COLOR_NAMES, colorLabel } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { goos } from '../myra/goos.ts';
import { applyColors, following } from './colors.ts';
import { MYRA_COLORS, settings } from './settings.ts';
import { applyToolbar } from '../ui/toolbarConfig.ts';
import { placeTray } from '../wireframe/pieces.ts';
import { useFont } from '../wireframe/tilt.ts';
import { appState } from '../core/state.ts';

// ---------- widgets snap into the left and right sidebars. Drag one by its title: little drop boxes show where it can go ----------
// the Boards panel is pinned at the top left (it's home to your boards and Settings), everything else can move
const WG_DEFAULT = { left: ['layers', 'colors'], right: ['design', 'tray'] };

const WG_ALL = ['layers', 'colors', 'design', 'tray'];

const wgEl = k =>
  k === 'design' ? $('design') : k === 'tray' ? $('tray') : document.querySelector(`.box[data-box="${k}"]`);

const wgKey = el => (el.id === 'design' ? 'design' : el.id === 'tray' ? 'tray' : el.dataset.box);

function wgLayout() {
  // the saved layout, with anything missing (a new widget) added where it belongs by default
  const L = settings.layout || WG_DEFAULT,
    seen = new Set(),
    clean = side => (L[side] || []).filter(k => WG_ALL.includes(k) && !seen.has(k) && seen.add(k));
  const out = { left: clean('left'), right: clean('right') };
  WG_ALL.forEach(k => {
    if (!seen.has(k)) (WG_DEFAULT.left.includes(k) ? out.left : out.right).push(k);
  });
  return out;
}

let wgLast = '';
let wgJustDragged = false;

function applyLayout() {
  const L = wgLayout(),
    key = JSON.stringify(L);
  if (key === wgLast) return;
  wgLast = key;
  const put = (col, keys) =>
    keys.forEach(k => {
      const el = wgEl(k);
      if (el && !el.classList.contains('in-sheet')) col.appendChild(el);
    }); // a widget showing in a phone sheet goes home when the sheet closes
  put($('side'), L.left);
  put($('sideR'), L.right);
}

function wgDragStart(e, el) {
  // the widget itself lifts off the sidebar and follows the cursor, so you can see what you're holding
  const r0 = el.getBoundingClientRect(),
    gx = e.clientX - r0.left,
    gy = e.clientY - r0.top;
  Object.assign(el.style, {
    position: 'fixed',
    left: r0.left + 'px',
    top: r0.top + 'px',
    width: r0.width + 'px',
    maxHeight: Math.min(r0.height, 320) + 'px',
    overflow: 'hidden',
    zIndex: 400,
    pointerEvents: 'none',
    margin: 0,
  });
  const home = [el.parentNode, el.nextSibling];
  document.body.appendChild(el); // carried above both sidebars, not inside one
  el.classList.add('wg-lifted');
  document.body.classList.add('wg-arranging');
  const slots = [];
  [
    [$('side'), true],
    [$('sideR'), false],
  ].forEach(([col, pinned]) => {
    const kids = [...col.children].filter(c => !c.classList.contains('wg-off'));
    kids.forEach((c, i) => {
      if (pinned && i === 0) return;
      const s = document.createElement('div');
      s.className = 'wg-slot';
      col.insertBefore(s, c);
      slots.push(s);
    });
    const s = document.createElement('div');
    s.className = 'wg-slot';
    col.appendChild(s);
    slots.push(s);
  });
  let pick = null;
  const move = ev => {
    el.style.left = ev.clientX - gx + 'px';
    el.style.top = ev.clientY - gy + 'px';
    let best = null,
      bd = 1e9;
    slots.forEach(s => {
      const r = s.getBoundingClientRect(),
        d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
      if (d < bd) {
        bd = d;
        best = s;
      }
    });
    if (best !== pick) {
      pick?.classList.remove('on');
      pick = best;
      pick?.classList.add('on');
    }
  };
  const end = drop => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('keydown', esc, true);
    if (drop && pick) pick.parentNode.insertBefore(el, pick);
    else home[0].insertBefore(el, home[1]?.parentNode === home[0] ? home[1] : null);
    slots.forEach(s => s.remove());
    ['position', 'left', 'top', 'width', 'maxHeight', 'overflow', 'zIndex', 'pointerEvents', 'margin'].forEach(
      k => (el.style[k] = ''),
    );
    el.classList.remove('wg-lifted');
    document.body.classList.remove('wg-arranging');
    wgJustDragged = true;
    setTimeout(() => (wgJustDragged = false), 50);
    if (drop && pick) {
      const keys = col => [...col.children].map(wgKey).filter(k => WG_ALL.includes(k));
      settings.layout = { left: keys($('side')), right: keys($('sideR')) };
      wgLast = JSON.stringify(wgLayout());
      applySettings();
      placeTray();
    }
  };
  const up = () => end(true),
    esc = ev => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        end(false);
      }
    };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('keydown', esc, true);
  move(e);
}
// listen first: some widgets (Wireframe) keep their clicks to themselves
const WIDGETS = [
  ['wLayers', () => document.querySelector('.box[data-box="layers"]')],
  ['wColors', () => document.querySelector('.box[data-box="colors"]')],
  ['wDesign', () => $('design')],
  ['wTray', () => $('tray')],
];

export function applySettings() {
  queueMicrotask(() => applyColors());
  queueMicrotask(() => applyGridShape());
  queueMicrotask(() => applyToolbar());
  goos.forEach(g => g.setColors(MYRA_COLORS[settings.myra] || MYRA_COLORS.golden));
  // widgets: the panels people can turn off (the Boards panel always stays: it holds their boards and Settings)
  WIDGETS.forEach(([k, el]) => el()?.classList.toggle('wg-off', settings[k] === false));
  [
    ['layers', 'wLayers'],
    ['tray', 'wTray'],
  ].forEach(([sh, k]) =>
    document.querySelector(`#hub [data-sheet="${sh}"]`)?.classList.toggle('wg-off', settings[k] === false),
  );
  queueMicrotask(() => {
    applyLayout();
    placeTray();
  });
  const dark = following()
    ? appState.cae.mode === 'dark'
    : settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('has-caelestia', !!appState.cae);
  document.body.classList.toggle('following-caelestia', following());
  // the font for text on the board (and in docs) that has no font of its own; Myra's glyph font stays first so ✦ is still a cloudberry
  {
    const df = (settings.defaultFont || '').trim().replace(/"/g, '');
    if (df)
      document.documentElement.style.setProperty(
        '--board-font',
        `"Myra Mark", "${df}", "Figtree", system-ui, sans-serif`,
      );
    else document.documentElement.style.removeProperty('--board-font');
    queueMicrotask(() => {
      if (df) useFont(df);
      const b = $('defaultFontBtn');
      if (b) {
        b.textContent = df || 'Figtree';
        b.style.fontFamily = df ? `"${df}", "Figtree", system-ui, sans-serif` : '';
      }
    });
  }
  document.body.classList.toggle('icons-duo', settings.iconStyle === 'duotone');
  document.body.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document
    .querySelectorAll('[data-seg]')
    .forEach(g =>
      g.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', settings[g.dataset.seg] === b.dataset.v)),
    );
  $('obNotes').innerHTML = $('noteColors').innerHTML =
    `<button data-nc="random" class="rand ${settings.noteColor === 'random' ? 'on' : ''}" title="A random colour"></button>` +
    COLOR_NAMES.map(
      n =>
        `<button data-nc="${n}" title="${colorLabel(n)}" style="background:${COLORS[n]}" class="${settings.noteColor === n ? 'on' : ''}"></button>`,
    ).join('');
  // Myra's name, how lively she is, and whether her character shows
  const mn = (settings.myraName || '').trim() || 'Myra';
  window.myraName = mn;
  [['mName'], ['mcHeadName'], ['coachName']].forEach(([id]) => {
    const el = $(id);
    if (el) el.textContent = mn;
  });
  ['mInput', 'mcInput'].forEach(id => {
    const el = $(id);
    if (el) el.placeholder = `Ask ${mn}… “group these by theme”`;
  });
  const bs = $('mBubble')?.querySelector('small');
  if (bs) bs.textContent = mn.toLowerCase();
  document.querySelectorAll('[data-mname]').forEach(el => (el.textContent = el.dataset.mname.replace('{name}', mn)));
  if ($('myraNameIn') && document.activeElement !== $('myraNameIn')) $('myraNameIn').value = settings.myraName || '';
  window.myraCalm = settings.myraCalm !== 'lively';
  document.body.classList.toggle('myra-calm', window.myraCalm);
  window.myraMuted = settings.myraCalm === 'calmest';
  goos.forEach(gg => gg.draw?.());
  document.body.classList.toggle('myra-hidden', settings.myraChar === false);
  document.body.classList.toggle('no-grid', !settings.grid);
  document.body.classList.toggle('neat', !settings.tilt);
  document.body.classList.toggle('calm', !settings.motion);
  $('keys').classList.toggle('hide', !settings.keys);
  document.documentElement.classList.toggle('no-win-buttons', settings.winButtons === false); // tiling compositors place the window themselves
  $('obMyra').innerHTML = $('myraColors').innerHTML = Object.entries(MYRA_COLORS)
    .map(
      ([n, c]) =>
        `<button data-mc="${n}" title="${colorLabel(n)}" style="background:${c.B}" class="${settings.myra === n ? 'on' : ''}"></button>`,
    )
    .join('');
  document.querySelectorAll('[data-set]').forEach(t => (t.checked = !!settings[t.dataset.set]));
  try {
    localStorage.setItem('fenmyr:settings', JSON.stringify(settings));
  } catch (e) {}
}
export function init26() {
  document.addEventListener(
    'pointerdown',
    e => {
      const h = e.target.closest('.side .box > header, .side #design .dz-head, .side #tray .tray-head');
      if (!h || e.button !== 0 || e.pointerType === 'touch' || e.target.closest('button, input, .brand')) return;
      const el = h.parentElement;
      if (el.dataset.box === 'boards') return;
      const x0 = e.clientX,
        y0 = e.clientY;
      const go = ev => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        stop();
        wgDragStart(ev, el);
      };
      const stop = () => {
        removeEventListener('pointermove', go);
        removeEventListener('pointerup', stop);
      };
      addEventListener('pointermove', go);
      addEventListener('pointerup', stop);
    },
    true,
  );
}
