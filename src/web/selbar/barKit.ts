import { $ } from '../core/dom.ts';
import { remember } from '../core/history.ts';
import { openColor } from '../ui/colorPicker.ts';
import { closestTo, htmlIn, oneIn } from '../ui/dom.ts';
import { closeOnOutsidePress } from '../ui/popover.ts';
import { opensUp } from './float.ts';

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

// a group that folds into the ··· menu when the bar runs out of room (higher numbers fold first, 0 last)
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

// the bar's dropdowns: open on click (on the side of the bar with room), close on a pick or a click elsewhere
export function closeSbPops() {
  const was = document.querySelector('.sb-popw.open');
  htmlIn(document, '.sb-popw.open').forEach(w => {
    w.classList.remove('open');
  });
  marks.fs = marks.sp = marks.sk = marks.sq = false;
  if (was) $('selbar').dataset.key = '';
}

// the colour wheel for one of the bar's colour settings, on the side of the bar away from the selection
export function openBarColor(o: {
  title: string;
  hex: string;
  presets: string[];
  apply: (hex: string) => void;
  reset: () => void;
}) {
  const bar = $('selbar'),
    r = bar.getBoundingClientRect();
  closeSbPops();
  openColor({
    tint: true,
    boardColors: true,
    fromBar: true,
    at: { x: r.left + r.width / 2 - 140, y: opensUp(bar, 480) ? r.top - 480 : r.bottom + 12 },
    ...o,
  });
}

// the bar is rebuilt on the next frame
export const rebuildBar = () => {
  $('selbar').dataset.key = '';
};

// the ··· menu that groups fold into, hidden while it holds none
export const moreHtml = () => {
  const more = pop('more', Icon('more', { cls: 'sb-l24' }), '<div class="sb-morebody"></div>', 'More');
  return `<span class="sb-sep sb-moresep"></span>${more}`;
};

// When the bar runs out of room (a narrow window, or bigger icons), groups move into the ··· menu, least important
// first, and then the label goes. The side panels paint over the board, so a bar wider than the room between them
// would lose its last buttons under one.
export function foldSelbar(bar: HTMLElement, room: number) {
  const body = bar.querySelector('.sb-morebody'),
    wrap = htmlIn(bar, '[data-popw="more"]')[0],
    sep = htmlIn(bar, '.sb-moresep')[0],
    label = oneIn(bar, ':scope > .sb-label');
  if (body && wrap && sep) {
    const groups = htmlIn(bar, '.sb-g').sort((a, b) => +(b.dataset.fold ?? 0) - +(a.dataset.fold ?? 0));
    for (const g of groups) {
      if (bar.scrollWidth <= room) break;
      htmlIn(g, ':scope > .sb-sep').forEach(x => {
        x.remove();
      });
      body.appendChild(g);
    }
    const empty = !body.children.length;
    wrap.hidden = empty;
    sep.hidden = empty;
  }
  if (label) label.hidden = bar.scrollWidth > room;
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
    count: Icon('count'),
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

// hover a button in the selection bar, or reach it from the keyboard: a quick little name bubble above it (the same
// look as the main toolbar's), or below it when the bar is at the top of the view
export function initTips() {
  const tipEl = document.createElement('div');
  tipEl.className = 'sb-tipbub';
  document.body.appendChild(tipEl);
  let tT: ReturnType<typeof setTimeout> | undefined;
  const tip = (target: EventTarget | null) => {
    const b = closestTo(target, 'button, .sb-tilt', HTMLElement);
    if (!b || b.closest('.sb-pop')) return;
    if (b.title) {
      // our bubble instead of the slow system one; an icon keeps the name the title gave it
      if (!b.ariaLabel && !b.textContent?.trim()) b.ariaLabel = b.title;
      b.dataset.tt = b.title;
      b.removeAttribute('title');
    }
    const txt =
      b.dataset.tt || TIP_NAMES[b.dataset.pop ?? ''] || b.getAttribute('aria-label') || TIP_NAMES[b.dataset.ts ?? ''];
    if (!txt || b.closest('.sb-popw.open')) return;
    clearTimeout(tT);
    tT = setTimeout(() => {
      const r = b.getBoundingClientRect(),
        above = r.top - tipEl.offsetHeight - 10;
      tipEl.textContent = txt;
      tipEl.classList.add('on');
      tipEl.style.left = `${Math.max(8, Math.min(innerWidth - tipEl.offsetWidth - 8, r.left + r.width / 2 - tipEl.offsetWidth / 2))}px`;
      tipEl.style.top = `${above < 8 ? r.bottom + 10 : above}px`;
    }, 250);
  };
  const hide = () => {
    clearTimeout(tT);
    tipEl.classList.remove('on');
  };
  $('selbar').addEventListener('pointerover', e => tip(e.target));
  $('selbar').addEventListener('focusin', e => {
    if (e.target instanceof Element && e.target.matches(':focus-visible')) tip(e.target);
  });
  $('selbar').addEventListener('focusout', hide);
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
      const open = document.querySelector('.sb-popw.open');
      if (e.key !== 'Escape' || !open) return;
      // focus inside the closing dropdown goes back to the button that opened it, not to the page
      const trigger = open.contains(document.activeElement) ? oneIn(open, ':scope > [data-pop]') : null;
      closeSbPops();
      trigger?.focus();
      e.stopPropagation();
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
      if (was) return;
      w.classList.add('open');
      // a dropdown inside the ··· menu opens to its side
      const p = oneIn(w, ':scope > .sb-pop');
      if (p && !w.closest('.sb-morebody')) w.classList.toggle('down', !opensUp($('selbar'), p.offsetHeight + 14));
    },
    true,
  );
}
