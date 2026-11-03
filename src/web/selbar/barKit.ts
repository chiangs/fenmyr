import { $, stage } from '../core/dom.ts';
import { remember } from '../core/history.ts';
import { openColor } from '../ui/colorPicker.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';
import { closeOnOutsidePress } from '../ui/popover.ts';

// the bar's icons, drawn once the icon set has loaded
export let ICON: Record<string, string> = {};

// one undo step per visit to a dropdown: set on the first change, cleared when the dropdown closes
export const marks = { fs: false, sk: false, sp: false, sq: false, fill: false, corners: false };

// the first change in a dropdown visit makes the undo step
export function markOnce(k: keyof typeof marks) {
  if (marks[k]) return;
  remember();
  marks[k] = true;
}

// a slider and its number box sit side by side: a change in one moves the other. Returns the one that changed,
// the slider, and the setting it's for (the attribute's value), or null when the event isn't from this pair.
export function syncPair(target: EventTarget | null, rangeAttr: string, numAttr: string) {
  const r = closestTo(target, `[${rangeAttr}], [${numAttr}]`, HTMLInputElement),
    row = r?.parentElement,
    rg = row?.querySelector(`[${rangeAttr}]`),
    nb = row?.querySelector(`[${numAttr}]`);
  if (!r || r.value === '' || !(rg instanceof HTMLInputElement) || !(nb instanceof HTMLInputElement)) return null;
  if (r === rg) nb.value = rg.value;
  else rg.value = nb.value;
  rg.style.setProperty('--p', pct(+rg.value, +rg.min, +rg.max));
  return { r, rg, key: r.getAttribute(rangeAttr) || r.getAttribute(numAttr) || '' };
}

// a little dropdown inside the bar (its options use the same buttons, so they work exactly like before)
export const pop = (id: string, trig: string, body: string, tip: string) =>
  `<span class="sb-popw" data-popw="${id}"><button class="sb-poptrig" data-pop="${id}" title="${tip}">${trig}</button><div class="sb-pop sb-pop-${id}">${body}</div></span>`;

// a group that folds into the ··· menu when the bar runs out of room (higher numbers fold first)
export const G = (fold: number, html: string) => `<span class="sb-g" data-fold="${fold}">${html}</span>`;

export const btn = (a: string, icon: string, tip: string, on?: boolean, disabled?: boolean) => {
  const cls = on ? 'on' : '',
    svg = ICON[icon] ?? '',
    off = disabled ? ' disabled' : '';
  return `<button class="sb-ic ${cls}" data-sb="${a}" title="${tip}"${off}>${svg}</button>`;
};

export const caret = () => Icon('caret-down', { cls: 'sb-caret' });

// a range slider's filled part, as a percentage of the way from min to max
export const pct = (v: number, min: number, max: number) =>
  `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;

// the bar's dropdowns: open on click (placed above the bar, never cut off), close on a pick or a click elsewhere
export function closeSbPops() {
  const was = document.querySelector('.sb-popw.open');
  htmlIn(document, '.sb-popw.open').forEach(w => {
    w.classList.remove('open');
  });
  marks.fs = marks.sp = marks.sk = marks.sq = false;
  if (was) $('selbar').dataset.key = '';
}

// the colour wheel, opened above the bar for one of its colour settings
export function openBarColor(o: {
  title: string;
  hex: string;
  presets: string[];
  apply: (hex: string) => void;
  reset: () => void;
}) {
  const r = $('selbar').getBoundingClientRect();
  closeSbPops();
  openColor({
    tint: true,
    boardColors: true,
    fromBar: true,
    at: { x: r.left + r.width / 2 - 140, y: r.top - 480 },
    ...o,
  });
}

// the bar is rebuilt on the next frame
export const rebuildBar = () => {
  $('selbar').dataset.key = '';
};

// when the bar runs out of room (a narrow window, or bigger icons), groups move into the ··· menu, least important first
export function foldSelbar(bar: HTMLElement) {
  const body = bar.querySelector('.sb-morebody'),
    wrap = htmlIn(bar, '[data-popw="more"]')[0],
    sep = htmlIn(bar, '.sb-moresep')[0];
  if (!body || !wrap || !sep) return;
  const room = () => {
    const s = stage.getBoundingClientRect(),
      m = document.getElementById('mPill')?.getBoundingClientRect();
    return Math.max(
      260,
      (m && m.left > s.left ? m.left - 16 : s.right - 16) -
        Math.max(s.left + 16, s.left + (document.body.classList.contains('phone') ? 8 : 280)),
    );
  };
  const groups = htmlIn(bar, '.sb-g')
    .filter(g => +(g.dataset.fold ?? 0) > 0)
    .sort((a, b) => +(b.dataset.fold ?? 0) - +(a.dataset.fold ?? 0)); // 0 = never folds
  for (const g of groups) {
    if (bar.scrollWidth <= room()) break;
    htmlIn(g, ':scope > .sb-sep').forEach(x => {
      x.remove();
    });
    body.appendChild(g);
  }
  const empty = !body.children.length;
  wrap.hidden = empty;
  sep.hidden = empty;
}

// pixel-snap: nudge each toolbar icon by the fraction of a screen pixel it sits off-grid, so its lines stay razor sharp
function snapIcons(root: HTMLElement) {
  const d = devicePixelRatio || 1;
  root.querySelectorAll('svg').forEach(svg => {
    svg.style.translate = '';
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const fx = (Math.round(r.left * d) - r.left * d) / d,
      fy = (Math.round(r.top * d) - r.top * d) / d;
    if (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) svg.style.translate = `${fx}px ${fy}px`;
  });
}

export const snapSoon = () =>
  requestAnimationFrame(() => {
    snapIcons($('tools'));
    snapIcons($('selbar'));
  });

export function initIcons() {
  ICON = {
    tags: Icon('tag'),
    tag: Icon('berry-label'),
    edit: Icon('edit'),
    del: Icon('trash'),
    head: Icon('header'),
    caption: Icon('captions'),
    color: Icon('palette'),
    name: Icon('name'),
    hex: Icon('hex'),
    crop: Icon('crop'),
    open: Icon('open'),
    link: Icon('link'),
    flip: Icon('refresh'),
    count: Icon('hash'),
  };
  addEventListener('resize', snapSoon);
  setTimeout(snapSoon, 300);
}

const TIP_NAMES: Record<string, string> = {
  color: 'Colour',
  size: 'Text size',
  more: 'More',
  bold: 'Bold',
  italic: 'Italic',
  under: 'Underline',
  strike: 'Strikethrough',
};

// hover a button in the selection bar: a quick little name bubble above it (the same look as the main toolbar's)
export function initTips() {
  const tipEl = document.createElement('div');
  tipEl.className = 'sb-tipbub';
  document.body.appendChild(tipEl);
  let tT: ReturnType<typeof setTimeout> | undefined;
  $('selbar').addEventListener('pointerover', e => {
    const b = closestTo(e.target, 'button, .sb-tilt', HTMLElement);
    if (!b || b.closest('.sb-pop')) return;
    if (b.title) {
      b.dataset.tt = b.title;
      b.removeAttribute('title');
    } // our bubble instead of the slow system one
    const txt =
      b.dataset.tt || TIP_NAMES[b.dataset.pop ?? ''] || b.getAttribute('aria-label') || TIP_NAMES[b.dataset.ts ?? ''];
    if (!txt || b.closest('.sb-popw.open')) return;
    clearTimeout(tT);
    tT = setTimeout(() => {
      const r = b.getBoundingClientRect();
      tipEl.textContent = txt;
      tipEl.classList.add('on');
      tipEl.style.left = `${Math.max(8, Math.min(innerWidth - tipEl.offsetWidth - 8, r.left + r.width / 2 - tipEl.offsetWidth / 2))}px`;
      tipEl.style.top = `${r.top - tipEl.offsetHeight - 10}px`;
    }, 250);
  });
  const hide = () => {
    clearTimeout(tT);
    tipEl.classList.remove('on');
  };
  $('selbar').addEventListener('pointerout', e => {
    const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (!to?.closest('#selbar') || !to.closest('button, .sb-tilt')) hide();
  });
  $('selbar').addEventListener('pointerdown', hide, true);
}

export function initPops() {
  closeOnOutsidePress('.sb-popw', () => {
    closeSbPops();
  });

  addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && document.querySelector('.sb-popw.open')) {
        closeSbPops();
        e.stopPropagation();
      }
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const w = closestTo(e.target, '[data-pop]')?.closest('.sb-popw');
      if (!w) return;
      e.stopImmediatePropagation();
      const was = w.classList.contains('open');
      htmlIn(document, '.sb-popw.open').forEach(x => {
        if (x === w || !x.contains(w)) x.classList.remove('open');
      }); // a dropdown inside the ··· menu keeps the menu open
      if (!was) w.classList.add('open');
    },
    true,
  );
}
