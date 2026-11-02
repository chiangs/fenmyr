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
import { closestTo } from '../ui/dom.ts';
import { choiceOf, flagOn, myraColors } from './settings.ts';

type Side = { left: string[]; right: string[] };
const htmlIn = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].filter(el => el instanceof HTMLElement);

// ---------- widgets snap into the left and right sidebars. Drag one by its title: little drop boxes show where it can go ----------
// the Boards panel is pinned at the top left (it's home to your boards and Settings), everything else can move
const WG_DEFAULT: Side = { left: ['layers', 'colors'], right: ['design', 'tray'] };

const WG_ALL = ['layers', 'colors', 'design', 'tray'];

const wgEl = (k: string) =>
  k === 'design' ? $('design') : k === 'tray' ? $('tray') : document.querySelector(`.box[data-box="${k}"]`);

const wgKey = (el: Element) =>
  el.id === 'design' ? 'design' : el.id === 'tray' ? 'tray' : el instanceof HTMLElement ? (el.dataset.box ?? '') : '';

function wgLayout() {
  // the saved layout, with anything missing (a new widget) added where it belongs by default
  const L = settings.layout || WG_DEFAULT,
    seen = new Set<string>(),
    clean = (side: keyof Side) => L[side].filter(k => WG_ALL.includes(k) && !seen.has(k) && seen.add(k));
  const out = { left: clean('left'), right: clean('right') };
  WG_ALL.forEach(k => {
    if (!seen.has(k)) (WG_DEFAULT.left.includes(k) ? out.left : out.right).push(k);
  });
  return out;
}

let wgLast = '';

function applyLayout() {
  const L = wgLayout(),
    key = JSON.stringify(L);
  if (key === wgLast) return;
  wgLast = key;
  const put = (col: HTMLElement, keys: string[]) =>
    keys.forEach(k => {
      const el = wgEl(k);
      if (el && !el.classList.contains('in-sheet')) col.appendChild(el);
    }); // a widget showing in a phone sheet goes home when the sheet closes
  put($('side'), L.left);
  put($('sideR'), L.right);
}

function wgDragStart(e: PointerEvent, el: HTMLElement) {
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
    zIndex: '400',
    pointerEvents: 'none',
    margin: '0',
  });
  const home = [el.parentNode, el.nextSibling];
  document.body.appendChild(el); // carried above both sidebars, not inside one
  el.classList.add('wg-lifted');
  document.body.classList.add('wg-arranging');
  const slots: HTMLElement[] = [];
  const columns: [HTMLElement, boolean][] = [
    [$('side'), true],
    [$('sideR'), false],
  ];
  columns.forEach(([col, pinned]) => {
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
  let pick: HTMLElement | null = null;
  const move = (ev: PointerEvent) => {
    el.style.left = ev.clientX - gx + 'px';
    el.style.top = ev.clientY - gy + 'px';
    let best: HTMLElement | null = null,
      bd = 1e9;
    for (const s of slots) {
      const r = s.getBoundingClientRect(),
        d = Math.hypot(ev.clientX - (r.left + r.width / 2), ev.clientY - (r.top + r.height / 2));
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best !== pick) {
      pick?.classList.remove('on');
      pick = best;
      pick?.classList.add('on');
    }
  };
  const end = (drop: boolean) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('keydown', esc, true);
    if (drop && pick) pick.parentNode?.insertBefore(el, pick);
    else home[0]?.insertBefore(el, home[1]?.parentNode === home[0] ? home[1] : null);
    slots.forEach(s => s.remove());
    for (const k of [
      'position',
      'left',
      'top',
      'width',
      'max-height',
      'overflow',
      'z-index',
      'pointer-events',
      'margin',
    ])
      el.style.removeProperty(k);
    el.classList.remove('wg-lifted');
    document.body.classList.remove('wg-arranging');
    if (drop && pick) {
      const keys = (col: HTMLElement) => [...col.children].map(wgKey).filter(k => WG_ALL.includes(k));
      settings.layout = { left: keys($('side')), right: keys($('sideR')) };
      wgLast = JSON.stringify(wgLayout());
      applySettings();
      placeTray();
    }
  };
  const up = () => end(true),
    esc = (ev: KeyboardEvent) => {
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
const WIDGETS: [string, () => Element | null][] = [
  ['wLayers', () => document.querySelector('.box[data-box="layers"]')],
  ['wColors', () => document.querySelector('.box[data-box="colors"]')],
  ['wDesign', () => $('design')],
  ['wTray', () => $('tray')],
];

export function applySettings() {
  queueMicrotask(() => applyColors());
  queueMicrotask(() => applyGridShape());
  queueMicrotask(() => applyToolbar());
  goos.forEach(g => g.setColors(myraColors(settings.myra)));
  // widgets: the panels people can turn off (the Boards panel always stays: it holds their boards and Settings)
  WIDGETS.forEach(([k, el]) => el()?.classList.toggle('wg-off', !flagOn(k)));
  for (const [sh, k] of [
    ['layers', 'wLayers'],
    ['tray', 'wTray'],
  ] as const)
    document.querySelector(`#hub [data-sheet="${sh}"]`)?.classList.toggle('wg-off', !flagOn(k));
  queueMicrotask(() => {
    applyLayout();
    placeTray();
  });
  const dark = following()
    ? appState.cae?.mode === 'dark'
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
  for (const g of htmlIn(document, '[data-seg]'))
    for (const b of htmlIn(g, '[data-v]')) b.classList.toggle('on', choiceOf(g.dataset.seg ?? '') === b.dataset.v);
  const randomOn = settings.noteColor === 'random' ? 'on' : '',
    noteColor = (n: string) => {
      const label = colorLabel(n),
        hex = COLORS[n],
        on = settings.noteColor === n ? 'on' : '';
      return `<button data-nc="${n}" title="${label}" style="background:${hex}" class="${on}"></button>`;
    };
  $('obNotes').innerHTML = $('noteColors').innerHTML =
    `<button data-nc="random" class="rand ${randomOn}" title="A random colour"></button>` +
    COLOR_NAMES.map(noteColor).join('');
  // Myra's name, how lively she is, and whether her character shows
  const mn = (settings.myraName || '').trim() || 'Myra';
  window.myraName = mn;
  for (const id of ['mName', 'mcHeadName', 'coachName']) {
    const el = document.getElementById(id);
    if (el) el.textContent = mn;
  }
  for (const id of ['mInput', 'mcInput']) {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      el.placeholder = `Ask ${mn}… “group these by theme”`;
  }
  const bs = $('mBubble')?.querySelector('small');
  if (bs) bs.textContent = mn.toLowerCase();
  for (const el of htmlIn(document, '[data-mname]')) el.textContent = (el.dataset.mname ?? '').replace('{name}', mn);
  const nameIn = document.getElementById('myraNameIn');
  if (nameIn instanceof HTMLInputElement && document.activeElement !== nameIn) nameIn.value = settings.myraName || '';
  window.myraCalm = settings.myraCalm !== 'lively';
  document.body.classList.toggle('myra-calm', window.myraCalm);
  window.myraMuted = settings.myraCalm === 'calmest';
  goos.forEach(gg => gg.draw());
  document.body.classList.toggle('myra-hidden', settings.myraChar === false);
  document.body.classList.toggle('no-grid', !settings.grid);
  document.body.classList.toggle('neat', !settings.tilt);
  document.body.classList.toggle('calm', !settings.motion);
  $('keys').classList.toggle('hide', !settings.keys);
  document.documentElement.classList.toggle('no-win-buttons', settings.winButtons === false); // tiling compositors place the window themselves
  $('obMyra').innerHTML = $('myraColors').innerHTML = Object.entries(MYRA_COLORS)
    .map(([n, c]) => {
      const label = colorLabel(n),
        on = settings.myra === n ? 'on' : '';
      return `<button data-mc="${n}" title="${label}" style="background:${c.B}" class="${on}"></button>`;
    })
    .join('');
  for (const t of document.querySelectorAll('[data-set]'))
    if (t instanceof HTMLInputElement) t.checked = !!flagOn(t.dataset.set ?? '');
  try {
    localStorage.setItem('fenmyr:settings', JSON.stringify(settings));
  } catch (e) {}
}
export function init26() {
  document.addEventListener(
    'pointerdown',
    e => {
      const h = closestTo(e.target, '.side .box > header, .side #design .dz-head, .side #tray .tray-head');
      if (!h || e.button !== 0 || e.pointerType === 'touch' || closestTo(e.target, 'button, input, .brand')) return;
      const el = h.parentElement;
      if (!el || el.dataset.box === 'boards') return;
      const x0 = e.clientX,
        y0 = e.clientY;
      const go = (ev: PointerEvent) => {
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
