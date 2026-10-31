// @ts-nocheck
import { toWorld } from '../canvas/handles.ts';
import { STROKE_TEXT, TILTS, canStroke, esc, renderCard, skStyle } from '../canvas/render.ts';
import { byId, linkById, renderWires, selectOnly, wireColor, wireW } from '../canvas/wires.ts';
import { openCanvas } from '../cards/canvas.ts';
import { COLL, parentOf } from '../cards/collection.ts';
import { cropping, endCrop, startCrop } from '../cards/crop.ts';
import { offerFill, spotsIn } from '../cards/imageFill.ts';
import { SHAPE_FILL } from '../cards/shapes.ts';
import { COLORS, COLOR_NAMES, colorLabel } from '../core/base.ts';
import { $, cardsEl, stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { DOC_FONT, SUGGESTED_FONTS, openDoc } from '../docs/editor.ts';
import { editTag, fitText } from '../edit/text.ts';
import { setDue } from '../features/due.ts';
import { startEdit, tagEditor } from '../features/tags.ts';
import { homeAt } from '../library/home.ts';
import { removeSelected } from '../myra/helpers.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { drawVec, syncCornerPop, vec, vecCard } from '../tools/penEdit.ts';
import { openColor } from '../ui/colorPicker.ts';
import { flipVNote, openVNote } from '../vault/notes.ts';
import { groupSel, renderDesign, syncDesign } from '../wireframe/pieces.ts';
import { makeSection, renameSection } from '../wireframe/sections.ts';
import { isLocalFont, openTiltPop, removeSection, setTilt, useFont } from '../wireframe/tilt.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { appState, session } from '../core/state.ts';

// ---------- the dock swaps to tools for whatever is selected ----------
const FILLABLE = ['note', 'todo', 'link', 'vnote'];

const ARRANGE_NAME = {
  left: 'align-l',
  hcenter: 'align-c',
  right: 'align-r',
  top: 'align-t',
  vcenter: 'align-m',
  bottom: 'align-b',
  dh: 'distribute-h',
  dv: 'distribute-v',
};

// each card's normal text size in px, so a size can be shown and typed as real pixels
let fsMark = false;
let skMark = false;
let spMark = false;
let sqMark = false;
// one undo step per visit to the size / stroke dropdown
const FS_BASE = { note: 15, title: 44, todo: 22, shape: 15, coll: 15 };

export const fsMul = c => (typeof c.fs === 'number' ? c.fs : FS[c.fs] || 1);
const fsPx = c => Math.round((FS_BASE[c.type] || 15) * fsMul(c));

function fitNote(c) {
  if (c.type !== 'note' || parentOf(c.id)) return;
  renderCard(c);
  const el = cardsEl.querySelector(`[data-id="${c.id}"]`),
    b2 = el.querySelector('.body');
  b2.style.height = 'auto';
  c.h = Math.max(80, b2.offsetHeight);
  b2.style.height = '';
  renderCard(c);
}

function setFsPx(px) {
  px = Math.max(6, Math.min(400, Math.round(+px || 0)));
  if (!px) return;
  selCards()
    .filter(c => SIZED.includes(c.type))
    .forEach(c => {
      const m = px / (FS_BASE[c.type] || 15),
        hit = Object.keys(FS).find(k => Math.abs(FS[k] - m) < 0.001);
      if (hit === 'm') delete c.fs;
      else c.fs = hit || +m.toFixed(6);
      renderCard(c);
      fitNote(c);
    });
  const t = document.querySelector('#selbar [data-pop="size"] b');
  if (t) t.textContent = px; // the bar stays put while the dropdown is open, so update its label by hand
  document.querySelectorAll('#selbar [data-fs]').forEach(b =>
    b.classList.toggle(
      'on',
      selCards()
        .filter(c => SIZED.includes(c.type))
        .every(c => (c.fs || 'm') === b.dataset.fs),
    ),
  );
  renderWires();
  save();
}

// line height (a multiple of the text size) and letter spacing (% of the text size); each kind of card has its own normal
const LH0 = { note: 1.45, title: 1, todo: 1.35, shape: 1.3, coll: 1.2 };
const LS0 = { title: -4 };

const lhOf = c => c.lh ?? LH0[c.type] ?? 1.4;
const lsOf = c => c.ls ?? LS0[c.type] ?? 0;

function setSpacing(kind, v) {
  selCards()
    .filter(c => SIZED.includes(c.type))
    .forEach(c => {
      const def = kind === 'lh' ? (LH0[c.type] ?? 1.4) : (LS0[c.type] ?? 0),
        n = v === 'normal' ? def : +v;
      if (!Number.isFinite(n)) return;
      if (Math.abs(n - def) < 1e-6) delete c[kind];
      else c[kind] = kind === 'lh' ? Math.round(n * 100) / 100 : Math.round(n * 10) / 10;
      renderCard(c);
      fitText(c);
      if (c.type === 'title') {
        const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
        if (el) c.h = el.offsetHeight;
      }
    });
  renderWires();
  save();
}

export const FS = { s: 0.8, m: 1, l: 1.4, xl: 2 };
export const SIZED = ['note', 'todo', 'title', 'shape', 'coll', 'vnote'];

export function selCards() {
  return [...session.sel].map(byId).filter(Boolean);
}
let ICON;

// fonts for board text: the same list as docs (fonts on this board first, then suggestions, then everything on this computer)
// every font this board uses: picked for notes and titles, wireframe text, font cards, and fonts set inside docs (most used first)
export function boardFonts() {
  const n = new Map(),
    add = f => {
      f = String(f || '')
        .replace(/^["']|["']$/g, '')
        .trim();
      if (f && !/^(system-ui|sans-serif|serif|monospace|inherit|-apple-system)$/i.test(f))
        n.set(f, (n.get(f) || 0) + 1);
    };
  session.board.cards.forEach(c => {
    if (c.font) add(c.font);
    if (c.type === 'doc' && c.doc)
      for (const m of JSON.stringify(c.doc).matchAll(/"fontFamily":"([^"]+)"/g)) add(m[1].split(',')[0]);
  });
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
}

function boardFontPop(btn, list) {
  let p = $('fontPop');
  if (p && !p.hidden && p.dataset.for === list.map(c => c.id).join()) {
    p.hidden = true;
    return;
  }
  if (!p) {
    p = document.createElement('div');
    p.id = 'fontPop';
    p.className = 'dv-pop pop-font board-font';
    document.body.appendChild(p);
    ['pointerdown', 'mousedown', 'wheel', 'dblclick'].forEach(t =>
      p.addEventListener(t, e => e.stopPropagation(), { passive: true }),
    );
  }
  p.dataset.for = list.map(c => c.id).join();
  p.style.zIndex = '';
  const cur = list.every(c => (c.font || '') === (list[0].font || '')) ? list[0].font || '' : null;
  const onBoard = boardFonts();
  const row = f =>
    `<button type="button" class="dp-row dp-font ${f === cur ? 'on' : ''}" data-bfont="${esc(f)}" style="font-family:'${esc(f)}', ${DOC_FONT}, system-ui">${esc(f)}${isLocalFont(f) ? '' : '<small>Google Fonts</small>'}</button>`;
  p.innerHTML = `<input class="dp-search" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${cur === '' ? 'on' : ''}" data-bfont="">Default font<small>Fenmyr’s own</small></button>
      ${onBoard.length ? `<div class="dp-h">Used on this board</div>${onBoard.map(row).join('')}` : ''}<div class="dp-h">Suggested</div>${SUGGESTED_FONTS.filter(
        f => !onBoard.includes(f),
      )
        .map(row)
        .join('')}
      <div class="dp-h">On your computer</div>${FONTS.filter(f => !SUGGESTED_FONTS.includes(f) && !onBoard.includes(f))
        .slice(0, 400)
        .map(row)
        .join('')}</div>`;
  SUGGESTED_FONTS.concat(onBoard).forEach(useFont);
  const r = btn.getBoundingClientRect();
  p.hidden = false;
  p.style.position = 'fixed';
  p.style.width = '260px';
  p.style.left = Math.max(10, Math.min(innerWidth - 270, r.left + r.width / 2 - 130)) + 'px';
  const above = r.top > innerHeight / 2;
  p.style.top = '';
  p.style.bottom = '';
  if (above) p.style.bottom = innerHeight - r.top + 8 + 'px';
  else p.style.top = r.bottom + 8 + 'px';
  const els = list.map(c => cardsEl.querySelector(`[data-id="${c.id}"]`)).filter(Boolean);
  const preview = f =>
    els.forEach((el, i) => {
      const c = list[i];
      const v = f === undefined ? c.font : f;
      el.classList.toggle('has-font', !!v);
      if (v) {
        useFont(v);
        el.style.setProperty('--cf', `"${v.replace(/"/g, '')}"`);
      } else el.style.removeProperty('--cf');
    });
  const q = p.querySelector('.dp-search');
  q.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      preview();
      p.hidden = true;
    }
    if (e.key === 'Enter') p.querySelector('.dp-font:not([hidden])')?.click();
  });
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    p.querySelectorAll('.dp-font').forEach(b => (b.hidden = !!v && !b.dataset.bfont.toLowerCase().includes(v)));
    p.querySelectorAll('.dp-h').forEach(h => (h.hidden = !!v));
  });
  p.onmouseover = e => {
    const b = e.target.closest('[data-bfont]');
    if (b) preview(b.dataset.bfont);
  };
  p.onmouseleave = () => preview();
  p.onclick = e => {
    const b = e.target.closest('[data-bfont]');
    if (!b) return;
    const f = b.dataset.bfont;
    remember();
    list.forEach(c => {
      if (f) c.font = f;
      else delete c.font;
      renderCard(c);
    });
    p.hidden = true;
    $('selbar').dataset.key = '';
    selectOnly(list.map(c => c.id));
    save();
  };
  setTimeout(() => q.focus(), 30);
}

// Settings → Board → Default font: the same list as the font picker, applied to every board
function defaultFontPop(btn) {
  let p = $('fontPop');
  if (p && !p.hidden && p.dataset.for === 'default') {
    p.hidden = true;
    return;
  }
  if (!p) {
    p = document.createElement('div');
    p.id = 'fontPop';
    p.className = 'dv-pop pop-font board-font';
    document.body.appendChild(p);
    ['pointerdown', 'mousedown', 'wheel', 'dblclick'].forEach(t =>
      p.addEventListener(t, e => e.stopPropagation(), { passive: true }),
    );
  }
  p.dataset.for = 'default';
  p.style.zIndex = '120'; // above the Settings window
  const cur = (settings.defaultFont || '').trim();
  const row = f =>
    `<button type="button" class="dp-row dp-font ${f === cur ? 'on' : ''}" data-bfont="${esc(f)}" style="font-family:'${esc(f)}', ${DOC_FONT}, system-ui">${esc(f)}${isLocalFont(f) ? '' : '<small>Google Fonts</small>'}</button>`;
  p.innerHTML = `<input class="dp-search" placeholder="Search fonts…" autocomplete="off" spellcheck="false">
      <div class="dp-scroll"><button type="button" class="dp-row dp-font ${cur === '' ? 'on' : ''}" data-bfont="">${DOC_FONT}<small>Fenmyr’s own</small></button>
      <div class="dp-h">Suggested</div>${SUGGESTED_FONTS.filter(f => f !== DOC_FONT)
        .map(row)
        .join('')}
      <div class="dp-h">On your computer</div>${FONTS.filter(f => !SUGGESTED_FONTS.includes(f))
        .slice(0, 400)
        .map(row)
        .join('')}</div>`;
  SUGGESTED_FONTS.forEach(useFont);
  const r = btn.getBoundingClientRect();
  p.hidden = false;
  p.style.position = 'fixed';
  p.style.width = '260px';
  p.style.left = Math.max(10, Math.min(innerWidth - 270, r.right - 260)) + 'px';
  p.style.bottom = '';
  const below = innerHeight - r.bottom > 340;
  p.style.top = below ? r.bottom + 8 + 'px' : Math.max(10, r.top - 8 - 330) + 'px';
  const q = p.querySelector('.dp-search');
  q.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') p.hidden = true;
    if (e.key === 'Enter') p.querySelector('.dp-font:not([hidden])')?.click();
  });
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    p.querySelectorAll('.dp-font').forEach(
      b => (b.hidden = !!v && !(b.dataset.bfont || DOC_FONT).toLowerCase().includes(v)),
    );
    p.querySelectorAll('.dp-h').forEach(h => (h.hidden = !!v));
  });
  p.onmouseover = null;
  p.onmouseleave = null;
  p.onclick = e => {
    const b = e.target.closest('[data-bfont]');
    if (!b) return;
    settings.defaultFont = b.dataset.bfont;
    applySettings();
    p.hidden = true;
  };
  setTimeout(() => q.focus(), 30);
}

// when the bar runs out of room (a narrow window, or bigger icons), groups move into the ··· menu, least important first
function foldSelbar(bar) {
  const body = bar.querySelector('.sb-morebody'),
    wrap = bar.querySelector('[data-popw="more"]');
  if (!body) return;
  const room = () => {
    const s = stage.getBoundingClientRect(),
      m = $('mPill')?.getBoundingClientRect();
    return Math.max(
      260,
      (m && m.left > s.left ? m.left - 16 : s.right - 16) -
        Math.max(s.left + 16, s.left + (document.body.classList.contains('phone') ? 8 : 280)),
    );
  };
  const groups = [...bar.querySelectorAll('.sb-g')]
    .filter(g => +g.dataset.fold > 0)
    .sort((a, b) => b.dataset.fold - a.dataset.fold); // 0 = never folds
  for (const g of groups) {
    if (bar.scrollWidth <= room()) break;
    g.querySelectorAll(':scope > .sb-sep').forEach(x => x.remove());
    body.appendChild(g);
  }
  const empty = !body.children.length;
  wrap.hidden = empty;
  bar.querySelector('.sb-moresep').hidden = empty;
}

// pixel-snap: nudge each toolbar icon by the fraction of a screen pixel it sits off-grid, so its lines stay razor sharp
function snapIcons(root) {
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

const snapSoon = () =>
  requestAnimationFrame(() => {
    snapIcons($('tools'));
    snapIcons($('selbar'));
  });

export function placeSelbar() {
  const bar = $('selbar'),
    dock = $('dock'),
    cs = selCards(),
    lw = session.selWire && linkById(session.selWire);
  if (lw && !homeAt) {
    dock.classList.add('ctx');
    bar.classList.add('on');
    const key = 'w' + lw.id + lw.bend + lw.dash + lw.arrow + !!(lw.pa || lw.pb) + lw.w + lw.color;
    if (bar.dataset.key === key) return;
    bar.dataset.key = key;
    const tb = (a, label, on, tip) =>
      `<button class="sb-txt ${on ? 'on' : ''}" data-wb="${a}" title="${tip}">${label}</button>`;
    const WCARET = Icon('caret-down', { cls: 'sb-caret' });
    const WCOL = [
        ['Default (follows the theme)', ''],
        ['Ink', '#3b342d'],
        ['Snow', '#ffffff'],
        ['Lingonberry', '#dc4b3e'],
        ['Cloudberry', '#f0b04a'],
        ['Moss', '#6fae5a'],
        ['Fjord', '#4f8fc9'],
        ['Heather', '#a98ad6'],
        ['Birch', '#c9b49a'],
      ],
      cw = wireColor(lw),
      ww = wireW(lw);
    const wp = (id, trig, body, tip) =>
      `<span class="sb-popw" data-popw="${id}"><button class="sb-poptrig" data-pop="${id}" title="${tip}">${trig}</button><div class="sb-pop sb-pop-${id}">${body}</div></span>`;
    const wline = n =>
      `<svg class="sb-wl" width="26" height="14" viewBox="0 0 26 14"><line x1="3" y1="7" x2="23" y2="7" stroke="currentColor" stroke-width="${n}" stroke-linecap="round"/></svg>`;
    const dots =
      WCOL.map(
        ([n, hex]) =>
          `<button data-wb="col:${hex}" title="${n}" class="${cw === hex ? 'on' : ''}${hex ? '' : ' sb-wdef'}" style="${hex ? `background:${hex}` : ''}"></button>`,
      ).join('') + `<button data-wb="colcustom" title="Pick another colour…" class="sb-wcustom"></button>`;
    const colorTrig = wp(
      'wcol',
      `<i class="sb-cur${cw ? '' : ' sb-wdef'}" style="${cw ? `background:${cw}` : ''}"></i>${WCARET}`,
      `<div class="sb-dots">${dots}</div>`,
      'Line colour',
    );
    const weightTrig = wp(
      'wwt',
      `${wline(ww)}${WCARET}`,
      `<div class="sb-sizelist">${[
        [2, 'Regular'],
        [4, 'Medium'],
        [6, 'Bold'],
      ]
        .map(
          ([n, t]) => `<button data-wb="w:${n}" class="${ww === n ? 'on' : ''}">${wline(n)}<span>${t}</span></button>`,
        )
        .join('')}</div>`,
      'Line weight',
    );
    bar.innerHTML =
      `<span class="sb-label">Connector</span>` +
      colorTrig +
      weightTrig +
      `<span class="sb-sep"></span>` +
      tb('curve', 'Curved', lw.bend !== 0, 'Curved line (drag the middle dot to bend it)') +
      tb('straight', 'Straight', lw.bend === 0, 'Straight line') +
      `<span class="sb-sep"></span>` +
      tb('dash', 'Dashed', !!lw.dash, 'Dashed line') +
      tb('arrow', 'Arrow', !!lw.arrow, 'Arrow at the end') +
      tb('flip', 'Flip', false, 'Swap which end has the arrow') +
      (lw.pa || lw.pb
        ? `<span class="sb-sep"></span>` +
          tb('auto', 'Auto ends', false, 'Let the line choose where it meets each card again')
        : '') +
      (lw.w || lw.color
        ? `<span class="sb-sep"></span>` + tb('reset', 'Reset', false, 'Back to the default weight and colour')
        : '') +
      `<span class="sb-sep"></span><button class="sb-ic" data-wb="del" title="Delete">${ICON.del}</button>`;
    return;
  }
  // hidden only while a drag is really happening, or a wheel that isn't from this bar is really on screen (left-over state never hides the bar)
  const wheelUp =
    $('cpop').classList.contains('on') &&
    $('cpop').classList.contains('tint') &&
    !$('cpop').classList.contains('from-bar') &&
    $('cpop').offsetParent &&
    $('settings').classList.contains('on');
  const show =
    cs.length && !homeAt && !(appState.drag && appState.drag.mode === 'move' && appState.drag.moved) && !wheelUp; // a wheel opened from this bar keeps the bar   // a color card's own bar shows right away, next to its wheel
  dock.classList.toggle('ctx', !!show);
  bar.classList.toggle('on', !!show);
  if (!show) {
    closeSbPops();
    bar.dataset.ids = '';
    if (bar.dataset.key !== '') {
      bar.dataset.key = '';
      renderDesign();
    }
    return;
  }
  const key =
    (document.body.classList.contains('dark') ? 'd' : 'l') +
    Math.round(innerWidth / 30) +
    cs
      .map(
        c =>
          c.id +
          (c.tags || []).join('|') +
          c.tcase +
          c.tc +
          (c.type === 'text' ? c.color : '') +
          c.fill +
          c.squig +
          c.align +
          c.lh +
          c.ls +
          c.stroke +
          c.sw +
          c.sdash +
          c.dl +
          c.dg +
          c.radius +
          c.fill +
          Math.round(c.r || 0) +
          !!c.tilted +
          c.color +
          c.head +
          c.tagText +
          c.hideName +
          c.hideHex +
          c.fill +
          c.url +
          c.fs +
          c.font +
          c.bold +
          c.italic +
          c.under +
          c.strike +
          !!c.cropEdit +
          !!c.src +
          c.group,
      )
      .join();
  // never rebuild under an open dropdown for the SAME things (it would yank the slider out from under you); a new selection always gets a fresh bar
  const ids = cs.map(c => c.id).join();
  if (bar.dataset.ids !== ids) {
    closeSbPops();
    bar.dataset.ids = ids;
  }
  if (bar.dataset.key === key || bar.querySelector('.sb-popw.open')) {
    syncDesign();
    return;
  }
  bar.dataset.key = key;
  renderDesign(); // never rebuild under an open dropdown (it would yank the slider out from under you)
  const one = cs.length === 1 ? cs[0] : null,
    btn = (a, icon, tip, on) =>
      `<button class="sb-ic ${on ? 'on' : ''}" data-sb="${a}" title="${tip}">${ICON[icon]}</button>`;
  // a little dropdown inside the bar (its options use the same buttons, so they work exactly like before)
  const pop = (id, trig, body, tip) =>
    `<span class="sb-popw" data-popw="${id}"><button class="sb-poptrig" data-pop="${id}" title="${tip}">${trig}</button><div class="sb-pop sb-pop-${id}">${body}</div></span>`;
  // a group that folds into the ··· menu when the bar runs out of room (higher numbers fold first)
  const G = (fold, html) => `<span class="sb-g" data-fold="${fold}">${html}</span>`;
  const CARET = Icon('caret-down', { cls: 'sb-caret' });
  // in dark mode a Snow card is drawn dark, so its chip shows what you will get
  const chipBg = n => (n === 'white' && document.body.classList.contains('dark') ? '#38332d' : COLORS[n]);
  const colorPop = (cur, dots) =>
    pop(
      'color',
      `<i class="sb-cur" style="background:${cur}"></i>${CARET}`,
      `<div class="sb-dots">${dots}</div>`,
      'Colour',
    );
  let more = '';
  let h = `<span class="sb-label">${one ? { section: 'Section', note: 'Note', todo: 'Checklist', title: 'Title', image: 'Image', link: 'Link', swatch: 'Colour', coll: one.kanban ? 'Kanban' : 'Collection', vnote: 'Vault note', doc: 'Doc', canvas: 'Canvas', shape: 'Shape', path: 'Pen shape', stamp: 'Stamp', audio: 'Voice memo', video: 'Video', spotify: 'Spotify', ink: 'Drawing', frame: 'Screen', box: 'Box', text: 'Text', font: 'Font' }[one.type] || 'Card' : cs.length + ' selected'}</span>`;
  if (cs.length > 1) {
    const A = [
      ['left', 'Align left edges'],
      ['hcenter', 'Align centres'],
      ['right', 'Align right edges'],
      ['top', 'Align tops'],
      ['vcenter', 'Align middles'],
      ['bottom', 'Align bottoms'],
    ];
    if (cs.length > 2) A.push(['dh', 'Space evenly across'], ['dv', 'Space evenly down']);
    h += G(
      0,
      `<div class="sb-sizes sb-style sb-arrange">${A.map(([k, t], i) => (i === 3 || i === 6 ? '<i class="sb-gap"></i>' : '') + `<button data-arr="${k}" title="${t}">${Icon(ARRANGE_NAME[k])}</button>`).join('')}</div>`,
    );
  }
  const fill = cs.filter(c => FILLABLE.includes(c.type));
  if (one?.type === 'coll')
    h +=
      G(
        2,
        colorPop(
          COLL[one.color]?.[0] || '#fff',
          Object.keys(COLL)
            .map(
              n =>
                `<button data-cc="${n}" title="${colorLabel(n)}" style="background:${COLL[n][0]}" class="${one.color === n ? 'on' : ''}"></button>`,
            )
            .join(''),
        ) + `<span class="sb-sep"></span>`,
      ) + btn('head', 'head', one.head === false ? 'Show the header' : 'Hide the header', one.head !== false);
  else if (fill.length)
    h += G(
      2,
      colorPop(
        fill.every(c => c.color === fill[0].color)
          ? chipBg(fill[0].color) || '#fff'
          : 'conic-gradient(#ffdcd8 0 25%, #ffe3bd 0 50%, #e0edd3 0 75%, #d9e7f3 0)',
        COLOR_NAMES.map(
          n =>
            `<button data-c="${n}" title="${colorLabel(n)}" style="background:${chipBg(n)}" class="${fill.every(c => c.color === n) ? 'on' : ''}"></button>`,
        ).join(''),
      ) + `<span class="sb-sep"></span>`,
    );
  if (one?.type === 'swatch')
    h +=
      btn('pick', 'color', 'Change the colour') +
      btn('hidename', 'name', one.hideName ? 'Show the name' : 'Hide the name', !one.hideName) +
      btn('hidehex', 'hex', one.hideHex ? 'Show the hex' : 'Hide the hex', !one.hideHex);
  if (one?.type === 'image' && cropping?.c === one) {
    bar.innerHTML = `<span class="sb-label">Crop</span><button class="sb-txt" data-crop="cancel">Cancel</button><button class="sb-txt" data-crop="reset">Reset</button><button class="sb-txt on" data-crop="done">Done</button>`;
    return;
  }
  if (one?.type === 'box' && one.img && !one.src)
    h += `<button class="sb-txt" data-fill="1" title="Fill this image spot">Fill image ✦</button>`;
  if (one?.type === 'image')
    h +=
      btn('crop', 'crop', 'Crop') +
      btn('tag', 'caption', one.tagText ? 'Remove the caption' : 'Add a caption', !!one.tagText);
  else if (one && !['coll', 'swatch', 'stamp', 'ink'].includes(one.type))
    h += G(6, btn('tag', 'tag', one.tagText ? 'Remove the label' : 'Add a label', !!one.tagText));
  if (one?.type === 'note')
    h += pop(
      'tags',
      `${ICON.tags}${(one.tags || []).length ? `<b>${one.tags.length}</b>` : ''}${CARET}`,
      `<div class="sb-tags" data-for="${one.id}">${tagEditor(one)}</div>`,
      'Tags',
    );
  if (one?.type === 'note')
    h += pop(
      'due',
      `${Icon('calendar')}${one.due ? '<b>•</b>' : ''}${CARET}`,
      `<div class="sb-due" data-for="${one.id}"><div class="sd-row"><label><span>Date</span><input type="date" data-due-d value="${esc((one.due || '').slice(0, 10))}"></label><label><span>Time</span><input type="time" data-due-t value="${esc((one.due || '').slice(11))}"></label></div><div class="sd-chips"><button data-due-q="0">Today</button><button data-due-q="1">Tomorrow</button><button data-due-q="7">Next week</button><button data-due-clear>Clear</button></div></div>`,
      'Due date',
    );
  if (one?.type === 'doc') h += btn('open', 'open', 'Open the doc');
  if (one?.type === 'vnote') h += btn('vnflip', 'flip', 'Flip the card') + btn('vnopen', 'open', 'Open in Obsidian');
  if (one?.type === 'canvas') h += btn('open', 'open', 'Open this canvas');
  if (one?.type === 'link' && one.url)
    h += btn('visit', 'open', 'Open the link') + btn('relink', 'link', 'Change the link');
  if (one?.type === 'spotify') h += btn('visit', 'open', 'Open in Spotify');
  if (one?.type === 'shape' && one.shape === 'line') {
    const st = one.squig || 'straight',
      sl = (k, label, v, min, max, unit = '') =>
        `<div class="sbc-top sb-sqrow" data-sqk="${k}"><span>${label}</span><input type="range" min="${min}" max="${max}" step="1" value="${v}" style="--p:${((v - min) / (max - min)) * 100}%" data-sq="${k}"><input type="number" min="${min}" max="${max}" value="${v}" data-sqn="${k}" aria-label="${label}"><b class="sb-unit">${unit}</b></div>`;
    const ic = {
      straight: 'M3 12h18',
      wavy: 'M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2',
      zigzag: 'M2 15l4-6 4 6 4-6 4 6 4-6',
      loopy: 'M2 15c3 0 4-8 2-8s-1 8 3 8 4-8 2-8-1 8 3 8 4-8 2-8-1 8 4 8',
    };
    h += G(
      2,
      pop(
        'squig',
        `<svg viewBox="0 0 24 24" class="sb-l24"><path d="${ic[st]}"/></svg>${CARET}`,
        `<div class="sb-corners sb-squig" data-st="${st}"><div class="sbc-chips sb-sqstyles">${[
          ['straight', 'Straight'],
          ['wavy', 'Wavy'],
          ['zigzag', 'Zigzag'],
          ['loopy', 'Loopy'],
        ]
          .map(
            ([k, t]) =>
              `<button data-sqs="${k}" class="${st === k ? 'on' : ''}"><svg viewBox="0 0 24 24"><path d="${ic[k]}"/></svg>${t}</button>`,
          )
          .join('')}</div>
          <div class="sb-sqmore">${sl('waves', 'Tightness', one.waves ?? 6, 1, 30)}${sl('round', st === 'loopy' ? 'Loop size' : 'Roundness', one.round ?? 60, 0, 100, '%')}${sl('height', 'Height', Math.round(one.h), 8, 300, 'px')}${sl('wobble', 'Wobble', one.wobble ?? 0, 0, 100, '%')}</div>
          ${sl('lw', 'Thickness', one.lw ?? 4, 1, 24, 'px')}</div>`,
        'Line style',
      ),
    );
  }
  if (one?.type === 'shape')
    h += G(
      2,
      pop(
        'color',
        `<i class="sb-cur" style="background:${SHAPE_FILL[one.fill || 'gray'] ? `var(--sh-${one.fill || 'gray'})` : one.fill}"></i>${CARET}`,
        `<div class="sb-dots">${one.shape === 'line' ? '' : `<button data-sf="none" title="No fill" class="sb-nofill ${one.fill === 'none' ? 'on' : ''}"></button>`}${Object.keys(
          SHAPE_FILL,
        )
          .map(
            n =>
              `<button data-sf="${n}" title="${colorLabel(n)}" style="background:var(--sh-${n})" class="${(one.fill || 'gray') === n ? 'on' : ''}"></button>`,
          )
          .join(
            '',
          )}<label class="sf-any ${SHAPE_FILL[one.fill || 'gray'] ? '' : 'on'}" title="Any colour"${SHAPE_FILL[one.fill || 'gray'] ? '' : ` style="--any:${one.fill}"`}><input type="color" data-sfany value="${SHAPE_FILL[one.fill || 'gray'] ? '#f6b45e' : one.fill}"></label></div>`,
        'Colour',
      ) + `<span class="sb-sep"></span>`,
    );
  const sized = cs.filter(c => SIZED.includes(c.type));
  if (sized.length) {
    const cur = sized.every(c => (c.fs || 'm') === (sized[0].fs || 'm')) ? sized[0].fs || 'm' : '',
      px = sized.every(c => fsPx(c) === fsPx(sized[0])) ? fsPx(sized[0]) : '';
    // bold is on by default for titles and collection names, off for everything else
    const isOn = (c, k) => c[k] ?? (k === 'bold' && ['title', 'coll'].includes(c.type));
    const ST = [
      ['bold', '<b>B</b>', 'Bold'],
      ['italic', '<i>I</i>', 'Italic'],
      ['under', '<u>U</u>', 'Underline'],
      ['strike', '<s>S</s>', 'Strikethrough'],
    ];
    const stb = ([k, l, t]) =>
      `<button data-ts="${k}" title="${t}" class="${sized.every(c => isOn(c, k)) ? 'on' : ''}">${l}</button>`;
    h += G(1, `<span class="sb-sep"></span><div class="sb-sizes sb-style">${ST.map(stb).join('')}</div>`); // B I U S stay together
    const al = sized.every(c => (c.align || 'left') === (sized[0].align || 'left')) ? sized[0].align || 'left' : '';
    h += G(
      1,
      `<div class="sb-sizes sb-style sb-align">${[
        ['left', 'Align left'],
        ['center', 'Centre'],
        ['right', 'Align right'],
      ]
        .map(
          ([k, t]) =>
            `<button data-al="${k}" title="${t}" class="${al === k ? 'on' : ''}">${Icon('text-' + k)}</button>`,
        )
        .join('')}</div>`,
    );
    const fnt = sized.every(c => (c.font || '') === (sized[0].font || '')) ? sized[0].font || '' : null;
    h += G(
      5,
      `<span class="sb-sep"></span><button class="sb-txt sb-font" data-sbfont="1" title="Font"><span style="${fnt ? `font-family:'${esc(fnt)}', var(--font)` : ''}">${fnt === null ? 'Mixed fonts' : esc(fnt || 'Default font')}</span>${Icon('caret-down', { cls: 'sb-caret', size: 10 })}</button>`,
    );
    const SZ = { s: 'Small', m: 'Medium', l: 'Large', xl: 'Extra large' };
    h += G(
      4,
      `<span class="sb-sep"></span>` +
        pop(
          'size',
          `<b>${px || 'Size'}</b>${CARET}`,
          `<div class="sb-fsbox"><div class="sbc-top sb-fsrow"><span>Size</span><button class="sb-fsstep" data-fsstep="-1" title="Smaller (⇧ for 10)">−</button><input type="number" min="6" max="400" step="1" value="${px}" placeholder="–" data-fsnum aria-label="Text size in pixels"><span class="sb-fspx">px</span><button class="sb-fsstep" data-fsstep="1" title="Bigger (⇧ for 10)">+</button></div><div class="sb-sizelist">${Object.entries(
            SZ,
          )
            .map(
              ([z, n]) =>
                `<button data-fs="${z}" class="sz-${z} ${cur === z ? 'on' : ''}"><b>Aa</b><span>${n}</span><em>${Math.round((FS_BASE[sized[0].type] || 15) * FS[z])}</em></button>`,
            )
            .join('')}</div></div>`,
          'Text size',
        ),
    );
  }
  if (sized.length) {
    const f = sized[0],
      lh = lhOf(f),
      ls = lsOf(f),
      pct = (v, a, b) => Math.max(0, Math.min(100, ((v - a) / (b - a)) * 100)) + '%';
    const row = (k, label, v, min, max, step, unit) =>
      `<div class="sbc-top"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${pct(v, min, max)}" data-sp="${k}"><input type="number" min="${min}" max="${max}" step="${step}" value="${v}" data-spn="${k}" aria-label="${label}"><b class="sb-unit">${unit}</b></div>`;
    const chips = (k, list) =>
      `<div class="sbc-chips sb-spchips">${list.map(([t, v]) => `<button data-spq="${k}:${v}">${t}</button>`).join('')}</div>`;
    h += G(
      6,
      pop(
        'spacing',
        `${Icon('spacing', { cls: 'sb-l24' })}${CARET}`,
        `<div class="sb-corners sb-spacing">${row('lh', 'Line height', lh, 0.8, 3, 0.05, '×')}${chips('lh', [
          ['Tight', 1.1],
          ['Normal', 'normal'],
          ['Airy', 1.8],
        ])}<i class="sb-sprule"></i>${row('ls', 'Letters', ls, -10, 30, 0.5, '%')}${chips('ls', [
          ['Tight', -3],
          ['Normal', 'normal'],
          ['Wide', 8],
        ])}<i class="sb-sprule"></i><div class="sbc-top"><span>Case</span></div><div class="sbc-chips sb-cases">${[
          ['', 'Aa', 'As typed'],
          ['upper', 'AB', 'UPPERCASE'],
          ['lower', 'ab', 'lowercase'],
          ['title', 'Ab', 'Title Case'],
        ]
          .map(
            ([k, g, t]) =>
              `<button data-tcase="${k}" title="${t}" class="${(f.tcase || '') === k ? 'on' : ''}"><b>${g}</b><small>${t}</small></button>`,
          )
          .join('')}</div></div>`,
        'Line height and letter spacing',
      ),
    );
  }
  // box (and screen) fill: wireframe grays, your pastels, and any color
  const fillable = cs.filter(
    c => (c.type === 'box' && !c.src) || c.type === 'frame' || (c.type === 'path' && c.closed),
  );
  if (fillable.length === cs.length && fillable.length) {
    const BF = [
      '#ffffff',
      '#f4f4f5',
      '#e4e4e7',
      '#a1a1aa',
      '#27272a',
      '#ffdcd8',
      '#ffe3bd',
      '#e0edd3',
      '#d9e7f3',
      '#ebe1f2',
      '#f1ebe2',
      '#f6b45e',
    ];
    const cur = fillable[0].fill || (fillable[0].type === 'box' ? '#e4e4e7' : '#ffffff');
    h += G(
      2,
      pop(
        'fill',
        `<i class="sb-cur${cur === 'none' ? ' sb-none' : ''}" style="background:${cur === 'none' ? '' : cur}"></i>${CARET}`,
        `<div class="sb-dots sb-fills"><button data-bfill="none" title="No fill" class="sb-nofill ${cur === 'none' ? 'on' : ''}"></button>${BF.map(v => `<button data-bfill="${v}" title="${v}" style="background:${v}" class="${cur.toLowerCase() === v ? 'on' : ''}"></button>`).join('')}<button class="sb-anycolor" data-bfwheel="1" title="Any colour"></button></div>`,
        'Fill',
      ),
    );
  }
  // text color for titles and wireframe text, with No fill (hollow letters)
  const tfs = cs.filter(c => c.type === 'title' || c.type === 'text');
  if (tfs.length === cs.length && tfs.length) {
    const f = tfs[0],
      cur = f.type === 'title' ? f.tc || '' : f.color || '#27272a',
      TF = ['#27272a', '#ffffff', '#ff5a6e', '#f6b45e', '#f7b955', '#5fc795', '#4f9dff', '#9b7bff'];
    h += G(
      2,
      pop(
        'tfill',
        `<i class="sb-cur sb-tcur${cur === 'none' ? ' sb-none' : ''}" style="--c:${cur && cur !== 'none' ? cur : 'var(--ink)'}">A</i>${CARET}`,
        `<div class="sb-dots sb-fills"><button data-tf="none" title="No fill" class="sb-nofill ${cur === 'none' ? 'on' : ''}"></button>${TF.map(v => `<button data-tf="${v}" title="${v}" style="background:${v}" class="${cur.toLowerCase() === v ? 'on' : ''}"></button>`).join('')}<button class="sb-anycolor" data-tfwheel="1" title="Any colour"></button></div>`,
        'Text colour',
      ),
    );
  }
  const stk = cs.filter(c => canStroke(c));
  if (stk.length === cs.length && stk.length) {
    const f = stk[0],
      col = f.stroke || '#27272a',
      w = f.sw || 0,
      textOnly = stk.every(c => STROKE_TEXT.includes(c.type)),
      max = textOnly ? 12 : 24,
      noDash = stk.some(c => ['icon', 'title', 'text'].includes(c.type)); // dashed/dotted is for shapes, boxes and screens
    const SK = [
      '#000000',
      '#ffffff',
      '#71717a',
      '#a1a1aa',
      '#ff5a6e',
      '#f6b45e',
      '#f7b955',
      '#5fc795',
      '#4f9dff',
      '#9b7bff',
      ...(session.board.palette || []).map(p => p.hex),
      ...session.board.cards.filter(c => c.type === 'swatch' && c.hex).map(c => c.hex),
    ].slice(0, 18);
    h += G(
      2,
      pop(
        'stroke',
        `<i class="sb-cur sb-skcur${w ? '' : ' none'}" style="--c:${col}"></i>${CARET}`,
        `<div class="sb-corners sb-stroke"><div class="sbc-top"><span>Stroke</span><input type="range" min="0" max="${max}" step="0.5" value="${w}" style="--p:${Math.min(100, (w / max) * 100)}%" data-skw><input type="number" min="0" max="${max}" step="0.5" value="${w}" data-skn aria-label="Stroke width"><b class="sb-unit">px</b></div>
          <div class="sb-dots sb-fills">${[...new Set(SK.map(v => v.toLowerCase()))].map(v => `<button data-skc="${v}" title="${v}" style="background:${v}" class="${w && col.toLowerCase() === v ? 'on' : ''}"></button>`).join('')}<button class="sb-anycolor" data-skwheel="1" title="Any colour"></button></div>
          ${
            noDash
              ? ''
              : (
                  () => {
                    const st = skStyle(f),
                      sl = (k, label, v, max) =>
                        `<div class="sbc-top sb-skrow"><span>${label}</span><input type="range" min="1" max="${max}" step="1" value="${v}" style="--p:${((v - 1) / (max - 1)) * 100}%" data-skr="${k}"><input type="number" min="1" max="${max}" value="${v}" data-skrn="${k}" aria-label="${label}"><b class="sb-unit">px</b></div>`;
                    return (
                      `<div class="sbc-chips sb-skstyles">${[
                        ['solid', 'Solid'],
                        ['dash', 'Dashed'],
                        ['dot', 'Dotted'],
                        ['none', 'None'],
                      ]
                        .map(
                          ([k, t]) =>
                            `<button data-skd="${k}" class="${(k === 'none' ? !w : w && st === k) ? 'on' : ''}"><span class="sks sks-${k}"></span>${t}</button>`,
                        )
                        .join('')}</div>` +
                      `<div class="sb-skdash${w && st !== 'solid' ? '' : ' off'}" data-skst="${st}">${sl('dl', 'Dash', f.dl ?? 8, 40)}${sl('dg', 'Gap', f.dg ?? 6, 40)}</div>`
                    );
                  }
                )()
          }</div>`,
        'Stroke',
      ),
    );
  }
  const rnd = cs.filter(
    c =>
      ['frame', 'box', 'image'].includes(c.type) ||
      c.type === 'path' ||
      (c.type === 'shape' && ['rect', 'tri', 'star'].includes(c.shape || 'rect')),
  );
  if (rnd.length === cs.length && rnd.length) {
    const cr = rnd[0].radius ?? (rnd[0].type === 'image' ? 12 : 0),
      same = rnd.every(c => (c.radius ?? (c.type === 'image' ? 12 : 0)) === cr);
    h += G(
      3,
      pop(
        'corners',
        `${Icon('corners')}<b>${same ? (cr >= 999 ? 'Pill' : cr) : '–'}</b>${CARET}`,
        `<div class="sb-corners"><div class="sbc-top"><span>Corners</span><input type="range" min="0" max="80" step="1" value="${Math.min(80, cr)}" style="--p:${Math.min(100, (cr / 80) * 100)}%" data-corners-range><input type="number" min="0" max="999" value="${cr >= 999 ? 0 : cr}" data-corners-num></div>
         <div class="sbc-chips">${[0, 4, 8, 12, 16, 24, 32].map(v => `<button data-corners="${v}" class="${same && cr === v ? 'on' : ''}"><i style="border-top-left-radius:${Math.min(v, 14)}px"></i>${v}</button>`).join('')}<button data-corners="999" class="${same && cr >= 999 ? 'on' : ''}"><i style="border-top-left-radius:14px"></i>Pill</button></div></div>`,
        'Corners',
      ),
    );
  }
  const seen = one && (one.type === 'stamp' && !one.tilted ? 0 : Math.round(one.r || 0));
  if (one && TILTS(one))
    h += G(
      3,
      `<span class="sb-sep"></span><button class="sb-tilt" data-sb="tiltpop" title="Tilt">${Icon('refresh')}<span class="sb-deg">${seen}°</span></button>`,
    ); // Reset lives in the tilt box
  const oneGroup = cs.length > 1 && cs.every(c => c.group && c.group === cs[0].group);
  if (cs.length > 1)
    h += G(
      9,
      `<span class="sb-sep"></span><button class="sb-txt sb-glass" data-sb="section" title="Create section · ⌥⌘G">Create section</button>`,
    ); // these tuck into ··· before the text controls do
  if (one?.type === 'section') h += `<button class="sb-txt" data-sb="rensection" title="Rename">Rename</button>`;
  if (one?.type === 'section')
    h += `<button class="sb-txt" data-sb="unsection" title="Remove section">Remove section</button><span class="sb-sep"></span>`;
  if (one?.type === 'section')
    h += G(
      2,
      colorPop(
        COLORS[one.color] || '#fff',
        COLOR_NAMES.map(
          n =>
            `<button data-sc="${n}" title="${colorLabel(n)}" style="background:${COLORS[n]}" class="${(one.color || 'white') === n ? 'on' : ''}"></button>`,
        ).join(''),
      ),
    );
  if (cs.length > 1)
    h += G(
      8,
      `<span class="sb-sep"></span><button class="sb-txt" data-sb="${oneGroup ? 'ungroup' : 'group'}" title="${oneGroup ? 'Ungroup · ⇧⌘G' : 'Group · ⌘G'}">${oneGroup ? 'Ungroup' : 'Group'}</button>`,
    );
  h +=
    `<span class="sb-sep sb-moresep"></span>` +
    pop('more', Icon('more', { cls: 'sb-l24' }), `<div class="sb-morebody">${more}</div>`, 'More');
  h += `<span class="sb-sep"></span>` + btn('del', 'del', 'Delete');
  bar.innerHTML = h;
  foldSelbar(bar);
  snapSoon();
}

let coverT = 0;

let coverKey = '';

function checkTitleCover() {
  const t = document.querySelector('.top');
  if (!t || !session.board) return;
  const key =
    session.view.x +
    ',' +
    session.view.y +
    ',' +
    session.view.z +
    ',' +
    session.board.cards.length +
    ',' +
    (appState.drag ? 1 : 0);
  if (key === coverKey && !appState.drag) return;
  coverKey = key;
  const r = t.getBoundingClientRect(),
    a = toWorld(r.left - 6, r.top - 6),
    b = toWorld(r.right + 6, r.bottom + 6);
  t.classList.toggle(
    'covered',
    session.board.cards.some(c => c.x < b.x && c.x + c.w > a.x && c.y < b.y && c.y + c.h > a.y),
  );
}

let gbKey = '';

function drawGroupBoxes() {
  if (!session.board) return;
  const gs = [
    ...new Set(
      selCards()
        .map(c => c.group)
        .filter(Boolean),
    ),
  ];
  const boxes = gs
    .map(g => {
      const cs = session.board.cards.filter(c => c.group === g && !c.onFrame);
      if (cs.length < 2) return null;
      const x0 = Math.min(...cs.map(c => c.x)),
        y0 = Math.min(...cs.map(c => c.y)),
        x1 = Math.max(...cs.map(c => c.x + c.w)),
        y1 = Math.max(...cs.map(c => c.y + c.h));
      return [x0 - 14, y0 - 14, x1 - x0 + 28, y1 - y0 + 28];
    })
    .filter(Boolean);
  const key = JSON.stringify(boxes);
  if (key === gbKey) return;
  gbKey = key;
  $('groupBoxes').innerHTML = boxes
    .map(
      ([x, y, w, h]) =>
        `<div class="group-box" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"><span>Group</span></div>`,
    )
    .join('');
}

// the bar's dropdowns: open on click (placed above the bar, never cut off), close on a pick or a click elsewhere
function closeSbPops() {
  const was = document.querySelector('.sb-popw.open');
  document.querySelectorAll('.sb-popw.open').forEach(w => w.classList.remove('open'));
  fsMark = false;
  spMark = false;
  skMark = false;
  sqMark = false;
  if (was && $('selbar')) $('selbar').dataset.key = '';
}

function setCorners(v, keepOpen) {
  if (vec && vec.sel.size) {
    const c = vecCard();
    v = Math.max(0, Math.round(+v || 0));
    vec.sel.forEach(i => (c.pts[i].r = v));
    renderCard(c);
    drawVec();
    syncCornerPop();
    save();
    return;
  } // editing points: round just the picked corners
  const cs = selCards().filter(
    c =>
      ['frame', 'box', 'image'].includes(c.type) ||
      c.type === 'path' ||
      (c.type === 'shape' && ['rect', 'tri', 'star'].includes(c.shape || 'rect')),
  );
  if (!cs.length) return;
  v = Math.max(0, Math.min(999, Math.round(+v || 0)));
  cs.forEach(c => {
    c.radius = v;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  save();
  const p = document.querySelector('.sb-pop-corners');
  if (p) {
    p.querySelectorAll('[data-corners]').forEach(b => b.classList.toggle('on', +b.dataset.corners === v));
    const t = document.querySelector('[data-pop="corners"] b');
    if (t) t.textContent = v >= 999 ? 'Pill' : v;
  }
  if (!keepOpen) {
    $('selbar').dataset.key = '';
    closeSbPops();
  }
}

function setSquig(patch) {
  const c = selCards().find(k => k.type === 'shape' && k.shape === 'line');
  if (!c) return;
  const el = cardsEl.querySelector(`[data-id="${c.id}"]`);
  // each style starts at its own look (wavy = round, zigzag = sharp); the slider takes it from there
  if (patch.squig) {
    c.squig = patch.squig === 'straight' ? undefined : patch.squig;
    c.round = { wavy: 100, zigzag: 0, loopy: 60 }[patch.squig] ?? c.round;
    if (c.squig && c.h < 40) {
      c.y -= (60 - c.h) / 2;
      c.h = 60;
    }
    if (!c.squig && c.h > 24) {
      c.y += (c.h - 24) / 2;
      c.h = 24;
    }
  }
  if (patch.height != null) {
    const nh = Math.max(8, +patch.height);
    c.y -= (nh - c.h) / 2;
    c.h = nh;
  }
  ['waves', 'round', 'wobble', 'lw'].forEach(k => {
    if (patch[k] != null) c[k] = +patch[k];
  });
  renderCard(c);
  if (el) Object.assign(cardsEl.querySelector(`[data-id="${c.id}"]`).style, { top: c.y + 'px', height: c.h + 'px' });
  selectOnly([c.id]);
  renderWires();
  save();
  const pop = $('selbar').querySelector('.sb-squig');
  if (pop && patch.squig) {
    pop.dataset.st = c.squig || 'straight';
    pop
      .querySelectorAll('[data-sqs]')
      .forEach(b => b.classList.toggle('on', b.dataset.sqs === (c.squig || 'straight')));
    const lab = pop.querySelector('[data-sqk="round"] span');
    if (lab) lab.textContent = c.squig === 'loopy' ? 'Loop size' : 'Roundness';
    [
      ['height', Math.round(c.h)],
      ['round', c.round ?? 60],
    ].forEach(([k, v]) => {
      const row = pop.querySelector(`[data-sqk="${k}"]`);
      if (!row) return;
      row.querySelectorAll('input').forEach(i => (i.value = v));
      const rg = row.querySelector('[data-sq]');
      rg.style.setProperty('--p', ((v - rg.min) / (rg.max - rg.min)) * 100 + '%');
    });
    const trig = $('selbar').querySelector('[data-pop="squig"] path');
    const src = pop.querySelector(`[data-sqs="${c.squig || 'straight'}"] path`);
    if (trig && src) trig.setAttribute('d', src.getAttribute('d'));
  }
}

// going to No fill: if it has no border yet, it gets one in the color the fill had, so it never just disappears
const toHex = v => {
  if (!v) return null;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const m = String(v).match(/\d+(\.\d+)?/g);
  return m && m.length >= 3
    ? '#' +
        m
          .slice(0, 3)
          .map(n => (+n | 0).toString(16).padStart(2, '0'))
          .join('')
    : null;
};

function autoBorder(c, was) {
  if (c.stroke && c.sw > 0) return;
  c.stroke = toHex(was) || '#27272a';
  c.sw = ['title', 'text', 'icon'].includes(c.type) ? 1 : 2;
}

const fillOf = c =>
  c.type === 'shape'
    ? SHAPE_FILL[c.fill || 'gray'] || c.fill
    : c.type === 'box'
      ? c.fill || '#e4e4e7'
      : c.type === 'frame'
        ? c.fill || '#ffffff'
        : c.fill;

function setTextFill(v) {
  const cs = selCards().filter(c => c.type === 'title' || c.type === 'text');
  if (!cs.length) return;
  cs.forEach(c => {
    const k = c.type === 'title' ? 'tc' : 'color',
      el = cardsEl.querySelector(`[data-id="${c.id}"] ${c.type === 'title' ? '.text' : '.tx'}`);
    if (v === 'none' && c[k] !== 'none')
      autoBorder(c, c[k] && c[k] !== 'none' ? c[k] : el && getComputedStyle(el).color);
    if (c.type === 'title' && v === '') delete c.tc;
    else c[k] = v;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  save();
  const t = $('selbar').querySelector('.sb-tcur');
  if (t) {
    t.classList.toggle('sb-none', v === 'none');
    t.style.setProperty('--c', v && v !== 'none' ? v : 'var(--ink)');
  }
  $('selbar')
    .querySelectorAll('[data-tf]')
    .forEach(b => b.classList.toggle('on', b.dataset.tf === v));
}

function setStroke(patch) {
  const cs = selCards().filter(c => canStroke(c));
  if (!cs.length) return;
  cs.forEach(c => {
    if (patch.none) {
      delete c.stroke;
      delete c.sw;
      delete c.sdash;
    } else {
      if (patch.color) c.stroke = patch.color;
      if (patch.w != null) c.sw = +patch.w;
      if (patch.dash != null) c.sdash = patch.dash === 'solid' ? undefined : patch.dash;
      if (patch.dl != null) c.dl = +patch.dl;
      if (patch.dg != null) c.dg = +patch.dg;
      if (!c.stroke) c.stroke = '#27272a';
      if (!(c.sw > 0) && (patch.color || patch.dash != null)) c.sw = STROKE_TEXT.includes(c.type) ? 1.5 : 2;
    }
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  renderWires();
  save();
  const f = cs[0],
    bar = $('selbar'),
    cur = bar.querySelector('.sb-skcur');
  if (cur) {
    cur.style.setProperty('--c', f.stroke || '#27272a');
    cur.classList.toggle('none', !(f.sw > 0));
  }
  bar
    .querySelectorAll('[data-skc]')
    .forEach(b => b.classList.toggle('on', f.sw > 0 && (f.stroke || '').toLowerCase() === b.dataset.skc));
  bar
    .querySelectorAll('[data-skd]')
    .forEach(b =>
      b.classList.toggle('on', b.dataset.skd === 'none' ? !(f.sw > 0) : f.sw > 0 && b.dataset.skd === skStyle(f)),
    );
  const dash = bar.querySelector('.sb-skdash');
  if (dash) {
    dash.classList.toggle('off', !(f.sw > 0) || skStyle(f) === 'solid');
    dash.dataset.skst = skStyle(f);
  }
  const rg = bar.querySelector('[data-skw]'),
    nb = bar.querySelector('[data-skn]');
  if (rg && document.activeElement !== nb) {
    rg.value = nb.value = f.sw || 0;
    rg.style.setProperty('--p', Math.min(100, ((f.sw || 0) / rg.max) * 100) + '%');
  }
}

function setFill(v, keep) {
  const cs = selCards().filter(
    c => (c.type === 'box' && !c.src) || c.type === 'frame' || (c.type === 'path' && c.closed),
  );
  if (!cs.length) return;
  cs.forEach(c => {
    if (v === 'none' && c.fill !== 'none') autoBorder(c, fillOf(c));
    c.fill = v;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  save();
  const t = document.querySelector('[data-pop="fill"] .sb-cur');
  if (t) {
    t.style.background = v === 'none' ? '' : v;
    t.classList.toggle('sb-none', v === 'none');
  }
  document.querySelectorAll('[data-bfill]').forEach(b => b.classList.toggle('on', b.dataset.bfill === v));
  if (!keep) {
    $('selbar').dataset.key = '';
    closeSbPops();
  }
}

let fillMark = false;

let cornersMark = false;

// line selected things up with each other, or space them evenly (titles use their real drawn height)
function arrange(how) {
  const cs = selCards().filter(c => !c.locked);
  if (cs.length < 2) return;
  remember();
  // real sizes right now (a title's saved width catches up a moment after it changes, which made the first click land off-center)
  const elOf = c => cardsEl.querySelector(`[data-id="${c.id}"]`),
    W = c => (c.type === 'title' ? elOf(c)?.offsetWidth || c.w : c.w),
    H = c => (c.type === 'title' ? elOf(c)?.offsetHeight || c.h : c.h);
  cs.forEach(c => {
    if (c.type === 'title') {
      c.w = W(c);
      c.h = H(c);
    }
  });
  // units: a whole group you selected moves as one block (its pieces keep their layout); pieces picked out of a group line up on their own
  const ids = new Set(cs.map(c => c.id)),
    units = new Map();
  cs.forEach(c => {
    const whole = c.group && session.board.cards.filter(k => k.group === c.group).every(k => ids.has(k.id)),
      key = whole ? 'g:' + c.group : c.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(c);
  });
  const U = [...units.values()].map(m => {
    const x = Math.min(...m.map(c => c.x)),
      y = Math.min(...m.map(c => c.y));
    return {
      m,
      x,
      y,
      w: Math.max(...m.map(c => c.x + W(c))) - x,
      h: Math.max(...m.map(c => c.y + H(c))) - y,
      nx: x,
      ny: y,
    };
  });
  if (U.length < 2) return;
  const x0 = Math.min(...U.map(u => u.x)),
    x1 = Math.max(...U.map(u => u.x + u.w)),
    y0 = Math.min(...U.map(u => u.y)),
    y1 = Math.max(...U.map(u => u.y + u.h));
  const moved = new Map(cs.map(c => [c.id, [c.x, c.y]]));
  if (how === 'left') U.forEach(u => (u.nx = x0));
  if (how === 'right') U.forEach(u => (u.nx = x1 - u.w));
  if (how === 'hcenter') U.forEach(u => (u.nx = (x0 + x1) / 2 - u.w / 2));
  if (how === 'top') U.forEach(u => (u.ny = y0));
  if (how === 'bottom') U.forEach(u => (u.ny = y1 - u.h));
  if (how === 'vcenter') U.forEach(u => (u.ny = (y0 + y1) / 2 - u.h / 2));
  if (how === 'dh') {
    const o = [...U].sort((a, b) => a.x - b.x),
      gap = (x1 - x0 - o.reduce((n, u) => n + u.w, 0)) / (o.length - 1);
    let x = x0;
    o.forEach(u => {
      u.nx = x;
      x += u.w + gap;
    });
  }
  if (how === 'dv') {
    const o = [...U].sort((a, b) => a.y - b.y),
      gap = (y1 - y0 - o.reduce((n, u) => n + u.h, 0)) / (o.length - 1);
    let y = y0;
    o.forEach(u => {
      u.ny = y;
      y += u.h + gap;
    });
  }
  U.forEach(u => {
    const dx = u.nx - u.x,
      dy = u.ny - u.y;
    u.m.forEach(c => {
      c.x += dx;
      c.y += dy;
    });
  });
  // a section brings what's inside it along
  cs.filter(c => c.type === 'section').forEach(sec => {
    const [ox, oy] = moved.get(sec.id),
      dx = sec.x - ox,
      dy = sec.y - oy;
    if (!dx && !dy) return;
    session.board.cards
      .filter(
        k =>
          !moved.has(k.id) &&
          k.x + k.w / 2 > ox &&
          k.x + k.w / 2 < ox + sec.w &&
          k.y + k.h / 2 > oy &&
          k.y + k.h / 2 < oy + sec.h,
      )
      .forEach(k => {
        k.x += dx;
        k.y += dy;
        renderCard(k);
      });
  });
  cs.forEach(c => {
    c.x = Math.round(c.x);
    c.y = Math.round(c.y);
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  renderWires();
  save();
}
export function init56() {
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
  };

  document.addEventListener(
    'pointerdown',
    e => {
      const p = $('fontPop');
      if (p && !p.hidden && !e.target.closest('#fontPop, [data-sbfont]')) p.hidden = true;
    },
    true,
  );

  $('defaultFontBtn').onclick = e => {
    e.stopPropagation();
    defaultFontPop(e.currentTarget);
  };

  addEventListener('resize', snapSoon);
  setTimeout(snapSoon, 300);

  (function tick() {
    placeSelbar();
    drawGroupBoxes();
    if (++coverT % 8 === 0) checkTitleCover();
    requestAnimationFrame(tick);
  })();

  $('selbar').addEventListener('pointerdown', e => e.stopPropagation());

  $('selbar').addEventListener('input', e => {
    if (!e.target.matches('[data-sfany]')) return;
    const one = selCards()[0];
    if (!one) return;
    one.fill = e.target.value;
    renderCard(one);
    selectOnly([one.id]);
    e.target.closest('.sf-any').style.setProperty('--any', one.fill);
    save();
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const a = e.target.closest('[data-wb]')?.dataset.wb,
        l = session.selWire && linkById(session.selWire);
      if (!a || !l) return;
      e.stopImmediatePropagation();
      if (a === 'curve') l.bend = l.bend === 0 ? undefined : l.bend;
      if (a === 'curve' && l.bend === undefined) delete l.bend;
      if (a === 'straight') l.bend = 0;
      const keepStyle = () => {
        settings.wireStyle = { ...(l.w ? { w: l.w } : {}), ...(l.color ? { color: l.color } : {}) };
        if (!Object.keys(settings.wireStyle).length) delete settings.wireStyle;
        try {
          localStorage.setItem('fenmyr:settings', JSON.stringify(settings));
        } catch (e) {}
      }; // the next connector you draw starts like this one
      if (a.startsWith('col:')) {
        const hex = a.slice(4);
        if (hex) l.color = hex;
        else delete l.color;
        keepStyle();
        closeSbPops();
      }
      if (a.startsWith('w:')) {
        const n = +a.slice(2);
        if (n === 4 || n === 6) l.w = n;
        else delete l.w;
        keepStyle();
        closeSbPops();
      }
      if (a === 'reset') {
        delete l.w;
        delete l.color;
        delete settings.wireStyle;
        try {
          localStorage.setItem('fenmyr:settings', JSON.stringify(settings));
        } catch (e) {}
      }
      if (a === 'colcustom') {
        const r = $('selbar').getBoundingClientRect();
        closeSbPops();
        openColor({
          tint: true,
          boardColors: true,
          title: 'Line colour',
          hex: wireColor(l) || '#6b6259',
          presets: ['#3b342d', '#ffffff', '#dc4b3e', '#f0b04a', '#6fae5a', '#4f8fc9', '#a98ad6', '#c9b49a'],
          fromBar: true,
          at: { x: r.left + r.width / 2 - 140, y: r.top - 480 },
          apply: hex => {
            l.color = hex;
            keepStyle();
            renderWires();
            save();
          },
          reset: () => {
            delete l.color;
            keepStyle();
            renderWires();
            save();
          },
        });
        return;
      }
      if (a === 'dash') l.dash = !l.dash;
      if (a === 'arrow') l.arrow = !l.arrow;
      if (a === 'flip') {
        [l.a, l.b] = [l.b, l.a];
        [l.pa, l.pb] = [l.pb, l.pa];
        if (!l.pa) delete l.pa;
        if (!l.pb) delete l.pb;
        if (l.bend) l.bend = -l.bend;
      }
      if (a === 'auto') {
        delete l.pa;
        delete l.pb;
      }
      if (a === 'del') {
        session.board.links = session.board.links.filter(x => x !== l);
        session.selWire = null;
      }
      $('selbar').dataset.key = '';
      renderWires();
      save();
      placeSelbar();
    },
    true,
  );

  // hover a button in the selection bar: a quick little name bubble above it (the same look as the main toolbar's)
  (() => {
    const tipEl = document.createElement('div');
    tipEl.className = 'sb-tipbub';
    document.body.appendChild(tipEl);
    let tT = 0;
    const NAMES = { color: 'Colour', size: 'Text size', more: 'More' };
    $('selbar').addEventListener('pointerover', e => {
      const b = e.target.closest('button, .sb-tilt');
      if (!b || b.closest('.sb-pop')) return;
      if (b.title) {
        b.dataset.tt = b.title;
        b.removeAttribute('title');
      } // our bubble instead of the slow system one
      const txt =
        b.dataset.tt ||
        NAMES[b.dataset.pop] ||
        b.getAttribute('aria-label') ||
        { bold: 'Bold', italic: 'Italic', under: 'Underline', strike: 'Strikethrough' }[b.dataset.ts];
      if (!txt || b.closest('.sb-popw.open')) return;
      clearTimeout(tT);
      tT = setTimeout(() => {
        const r = b.getBoundingClientRect();
        tipEl.textContent = txt;
        tipEl.classList.add('on');
        tipEl.style.left =
          Math.max(8, Math.min(innerWidth - tipEl.offsetWidth - 8, r.left + r.width / 2 - tipEl.offsetWidth / 2)) +
          'px';
        tipEl.style.top = r.top - tipEl.offsetHeight - 10 + 'px';
      }, 250);
    });
    const hide = () => {
      clearTimeout(tT);
      tipEl.classList.remove('on');
    };
    $('selbar').addEventListener('pointerout', e => {
      if (!e.relatedTarget || !e.relatedTarget.closest?.('#selbar')) hide();
      else if (!e.relatedTarget.closest('button, .sb-tilt')) hide();
    });
    $('selbar').addEventListener('pointerdown', hide, true);
  })();

  addEventListener(
    'pointerdown',
    e => {
      if (!e.target.closest('.sb-popw')) closeSbPops();
    },
    true,
  );

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
      const t = e.target.closest('[data-pop]');
      if (!t) return;
      e.stopImmediatePropagation();
      const w = t.closest('.sb-popw'),
        was = w.classList.contains('open');
      document.querySelectorAll('.sb-popw.open').forEach(x => {
        if (x === w || !x.contains(w)) x.classList.remove('open');
      }); // a dropdown inside the ··· menu keeps the menu open
      if (!was) w.classList.add('open');
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-sqs]');
      if (!b) return;
      e.stopImmediatePropagation();
      if (!sqMark) {
        remember();
        sqMark = true;
      }
      setSquig({ squig: b.dataset.sqs });
    },
    true,
  );

  $('selbar').addEventListener('input', e => {
    const r = e.target.closest('[data-sq], [data-sqn]');
    if (!r || r.value === '') return;
    if (!sqMark) {
      remember();
      sqMark = true;
    }
    const k = r.dataset.sq || r.dataset.sqn,
      row = r.parentElement,
      rg = row.querySelector('[data-sq]'),
      nb = row.querySelector('[data-sqn]');
    if (r === rg) nb.value = rg.value;
    else rg.value = nb.value;
    rg.style.setProperty('--p', ((rg.value - rg.min) / (rg.max - rg.min)) * 100 + '%');
    setSquig({ [k]: Math.max(+rg.min, Math.min(+rg.max, +r.value)) });
  });

  $('selbar').addEventListener('keydown', e => {
    if (!e.target.matches('[data-sqn]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      closeSbPops();
      placeSelbar();
    }
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-tf], [data-tfwheel]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      if (b.dataset.tf != null) return setTextFill(b.dataset.tf);
      const cs = selCards().filter(c => c.type === 'title' || c.type === 'text'),
        r = $('selbar').getBoundingClientRect(),
        was = cs.map(c => [c.tc, c.color, c.stroke, c.sw]);
      closeSbPops();
      openColor({
        tint: true,
        boardColors: true,
        title: 'Text colour',
        hex: toHex(cs[0].type === 'title' ? cs[0].tc : cs[0].color) || '#27272a',
        presets: ['#27272a', '#ffffff', '#ff5a6e', '#f6b45e', '#f7b955', '#5fc795', '#4f9dff', '#9b7bff'],
        fromBar: true,
        at: { x: r.left + r.width / 2 - 140, y: r.top - 480 },
        apply: hex => setTextFill(hex),
        reset: () => {
          cs.forEach((c, i) => {
            [c.tc, c.color, c.stroke, c.sw] = was[i];
            renderCard(c);
          });
          save();
        },
      });
    },
    true,
  );

  $('selbar').addEventListener('input', e => {
    const r = e.target.closest('[data-skw], [data-skn]');
    if (!r || r.value === '') return;
    if (!skMark) {
      remember();
      skMark = true;
    }
    const row = r.parentElement,
      rg = row.querySelector('[data-skw]'),
      nb = row.querySelector('[data-skn]');
    if (r === rg) nb.value = rg.value;
    else rg.value = nb.value;
    rg.style.setProperty('--p', Math.min(100, (rg.value / rg.max) * 100) + '%');
    setStroke({ w: Math.max(0, +r.value) });
  });

  $('selbar').addEventListener('input', e => {
    const r = e.target.closest('[data-skr], [data-skrn]');
    if (!r || r.value === '') return;
    if (!skMark) {
      remember();
      skMark = true;
    }
    const k = r.dataset.skr || r.dataset.skrn,
      row = r.parentElement,
      rg = row.querySelector('[data-skr]'),
      nb = row.querySelector('[data-skrn]');
    if (r === rg) nb.value = rg.value;
    else rg.value = nb.value;
    rg.style.setProperty('--p', ((rg.value - 1) / (rg.max - 1)) * 100 + '%');
    setStroke({ [k]: Math.max(1, +r.value) });
  });

  $('selbar').addEventListener('keydown', e => {
    if (e.target.matches('[data-skrn]')) {
      e.stopPropagation();
      if (e.key === 'Enter') {
        closeSbPops();
        placeSelbar();
      }
      return;
    }
    if (!e.target.matches('[data-skn]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      closeSbPops();
      placeSelbar();
    }
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const c = e.target.closest('[data-skc]'),
        d = e.target.closest('[data-skd]'),
        wh = e.target.closest('[data-skwheel]');
      if (!c && !d && !wh) return;
      e.stopImmediatePropagation();
      if ((c || d) && !skMark) {
        remember();
        skMark = true;
      } // one undo per visit to the dropdown
      if (c) return setStroke({ color: c.dataset.skc });
      if (d) return setStroke(d.dataset.skd === 'none' ? { none: true } : { dash: d.dataset.skd });
      const cs = selCards().filter(k => canStroke(k));
      remember();
      const was = cs.map(k => [k.stroke, k.sw, k.sdash]),
        r = $('selbar').getBoundingClientRect();
      closeSbPops();
      openColor({
        tint: true,
        boardColors: true,
        title: 'Stroke',
        hex: cs[0].stroke || '#27272a',
        presets: ['#27272a', '#ffffff', '#ff5a6e', '#f6b45e', '#f7b955', '#5fc795', '#4f9dff', '#9b7bff'],
        fromBar: true,
        at: { x: r.left + r.width / 2 - 140, y: r.top - 480 },
        apply: hex => setStroke({ color: hex }),
        reset: () => {
          cs.forEach((k, i) => {
            [k.stroke, k.sw, k.sdash] = was[i];
            renderCard(k);
          });
          save();
        },
      });
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-bfill]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      setFill(b.dataset.bfill);
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      if (!e.target.closest('[data-bfwheel]')) return;
      e.stopImmediatePropagation();
      const cs = selCards().filter(
        c => (c.type === 'box' && !c.src) || c.type === 'frame' || (c.type === 'path' && c.closed),
      );
      if (!cs.length) return;
      remember();
      const was = cs.map(c => c.fill),
        r = $('selbar').getBoundingClientRect();
      closeSbPops();
      openColor({
        tint: true,
        boardColors: true,
        title: 'Fill',
        hex: cs[0].fill || (cs[0].type === 'box' ? '#e4e4e7' : '#ffffff'),
        presets: ['#ffffff', '#e4e4e7', '#27272a', '#ffdcd8', '#ffe3bd', '#e0edd3', '#d9e7f3', '#ebe1f2', '#f6b45e'],
        fromBar: true,
        at: { x: r.left + r.width / 2 - 140, y: r.top - 480 },
        apply: hex => setFill(hex, true),
        reset: () => {
          cs.forEach((c, i) => {
            c.fill = was[i];
            renderCard(c);
          });
          save();
        },
      });
    },
    true,
  );
  $('selbar').addEventListener('input', e => {
    if (!e.target.matches('[data-bfany]')) return;
    if (!fillMark) {
      remember();
      fillMark = true;
    }
    setFill(e.target.value, true);
  });

  $('selbar').addEventListener('change', e => {
    if (e.target.matches('[data-bfany]')) {
      fillMark = false;
      $('selbar').dataset.key = '';
    }
  });

  $('selbar').addEventListener('input', e => {
    const r = e.target.closest('[data-corners-range], [data-corners-num]');
    if (!r) return;
    if (!cornersMark) {
      remember();
      cornersMark = true;
    }
    const v = r.value;
    const other = r.matches('[data-corners-range]')
      ? r.parentElement.querySelector('[data-corners-num]')
      : r.parentElement.querySelector('[data-corners-range]');
    if (other) other.value = v;
    const rg = r.parentElement.querySelector('[data-corners-range]');
    rg.style.setProperty('--p', Math.min(100, (v / 80) * 100) + '%');
    setCorners(v, true);
  });

  $('selbar').addEventListener('change', () => {
    cornersMark = false;
  });

  $('selbar').addEventListener('input', e => {
    const r = e.target.closest('[data-sp], [data-spn]');
    if (!r || r.value === '' || r.value === '-') return;
    if (!spMark) {
      remember();
      spMark = true;
    }
    const k = r.dataset.sp || r.dataset.spn,
      row = r.parentElement,
      rg = row.querySelector('[data-sp]'),
      nb = row.querySelector('[data-spn]');
    if (r === rg) nb.value = rg.value;
    else rg.value = nb.value;
    rg.style.setProperty('--p', Math.max(0, Math.min(100, ((rg.value - rg.min) / (rg.max - rg.min)) * 100)) + '%');
    setSpacing(k, r.value);
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-tcase]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      selCards()
        .filter(c => SIZED.includes(c.type))
        .forEach(c => {
          if (b.dataset.tcase) c.tcase = b.dataset.tcase;
          else delete c.tcase;
          renderCard(c);
          fitText(c);
        });
      $('selbar')
        .querySelectorAll('[data-tcase]')
        .forEach(x => x.classList.toggle('on', x === b));
      selectOnly(selCards().map(c => c.id));
      renderWires();
      save();
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-spq]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      const [k, v] = b.dataset.spq.split(':');
      setSpacing(k, v);
      const f = selCards().find(c => SIZED.includes(c.type)),
        cur = k === 'lh' ? lhOf(f) : lsOf(f),
        row = $('selbar').querySelector(`[data-sp="${k}"]`).parentElement;
      row.querySelector('[data-sp]').value = row.querySelector('[data-spn]').value = cur;
      const rg = row.querySelector('[data-sp]');
      rg.style.setProperty('--p', Math.max(0, Math.min(100, ((cur - rg.min) / (rg.max - rg.min)) * 100)) + '%');
    },
    true,
  );

  $('selbar').addEventListener('keydown', e => {
    if (!e.target.matches('[data-spn]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      closeSbPops();
      placeSelbar();
    }
  });

  $('selbar').addEventListener('input', e => {
    if (!e.target.matches('[data-fsnum]') || !e.target.value) return;
    if (!fsMark) {
      remember();
      fsMark = true;
    }
    setFsPx(e.target.value);
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-fsstep]');
      if (!b) return;
      e.stopImmediatePropagation();
      const inp = $('selbar').querySelector('[data-fsnum]');
      const cur = +inp.value || fsPx(selCards().find(c => SIZED.includes(c.type)));
      if (!fsMark) {
        remember();
        fsMark = true;
      }
      inp.value = Math.max(6, Math.min(400, cur + b.dataset.fsstep * (e.shiftKey ? 10 : 1)));
      setFsPx(inp.value);
    },
    true,
  );

  $('selbar').addEventListener('keydown', e => {
    if (!e.target.matches('[data-fsnum]')) return;
    e.stopPropagation();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!fsMark) {
        remember();
        fsMark = true;
      }
      e.target.value = Math.max(
        6,
        Math.min(400, (+e.target.value || 15) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)),
      );
      setFsPx(e.target.value);
    }
    if (e.key === 'Enter') {
      setFsPx(e.target.value);
      fsMark = false;
      closeSbPops();
      $('selbar').dataset.key = '';
      placeSelbar();
    }
  });

  $('selbar').addEventListener('keydown', e => {
    if (e.target.matches('[data-corners-num]')) {
      e.stopPropagation();
      if (e.key === 'Enter') {
        closeSbPops();
        $('selbar').dataset.key = '';
      }
    }
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-corners]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      setCorners(b.dataset.corners);
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-al]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      selCards()
        .filter(c => SIZED.includes(c.type))
        .forEach(c => {
          if (b.dataset.al === 'left') delete c.align;
          else c.align = b.dataset.al;
          renderCard(c);
        });
      selectOnly(selCards().map(c => c.id));
      $('selbar').dataset.key = '';
      save();
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const b = e.target.closest('[data-arr]');
      if (!b) return;
      e.stopImmediatePropagation();
      arrange(b.dataset.arr);
    },
    true,
  );

  // the due date box in the selection bar: pick a date (and a time if it matters), or one of the quick days
  {
    const dueBox = el => el.closest('.sb-due'),
      dueSet = box => {
        const c = byId(box.dataset.for),
          d = box.querySelector('[data-due-d]').value,
          t = box.querySelector('[data-due-t]').value;
        if (c) setDue(c, d ? d + (t ? 'T' + t : '') : '');
      };
    $('selbar').addEventListener('change', e => {
      if (e.target.matches('[data-due-d], [data-due-t]')) dueSet(dueBox(e.target));
    });
    $('selbar').addEventListener('keydown', e => {
      if (e.target.matches('[data-due-d], [data-due-t]')) {
        e.stopPropagation();
        if (e.key === 'Enter') closeSbPops();
      }
    });
    $('selbar').addEventListener('click', e => {
      const b = e.target.closest('[data-due-q], [data-due-clear]');
      if (!b) return;
      e.stopPropagation();
      const box = dueBox(b),
        dIn = box.querySelector('[data-due-d]'),
        tIn = box.querySelector('[data-due-t]');
      if (b.matches('[data-due-clear]')) {
        dIn.value = tIn.value = '';
      } else {
        const d = new Date();
        d.setDate(d.getDate() + +b.dataset.dueQ);
        dIn.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      dueSet(box);
    });
  }

  $('selbar').onclick = e => {
    const cs = selCards(),
      one = cs[0],
      dot = e.target.closest('[data-c]'),
      cdot = e.target.closest('[data-cc]'),
      a = e.target.closest('[data-sb]')?.dataset.sb;
    if (a === 'group' || a === 'ungroup') {
      remember();
      return groupSel(a === 'group');
    }
    if (a === 'section') return makeSection(cs);
    if (a === 'untilt') {
      setTilt(one, 0);
      return;
    }
    if (a === 'tiltpop') {
      openTiltPop(one, e.target.closest('[data-sb]'));
      return;
    }
    if (a === 'unsection') return removeSection(cs.filter(c => c.type === 'section'));
    if (a === 'rensection') return renameSection(one);
    const sc = e.target.closest('[data-sc]');
    if (sc && one?.type === 'section') {
      remember();
      one.color = sc.dataset.sc;
      renderCard(one);
      selectOnly([one.id]);
      $('selbar').dataset.key = '';
      save();
      return;
    }
    const redraw = () => {
      cs.forEach(c => renderCard(c));
      selectOnly(cs.map(c => c.id));
      $('selbar').dataset.key = '';
      save();
    };
    if (dot) {
      cs.filter(c => FILLABLE.includes(c.type)).forEach(c => (c.color = dot.dataset.c));
      redraw();
    }
    if (cdot) {
      one.color = cdot.dataset.cc;
      redraw();
    }
    const sf = e.target.closest('[data-sf]');
    if (sf) {
      if (sf.dataset.sf === 'none' && one.fill !== 'none' && one.shape !== 'line') autoBorder(one, fillOf(one));
      one.fill = sf.dataset.sf;
      redraw();
    }
    const ts = e.target.closest('[data-ts]');
    if (ts) {
      const k = ts.dataset.ts,
        list = cs.filter(c => SIZED.includes(c.type)),
        isOn = c => c[k] ?? (k === 'bold' && ['title', 'coll'].includes(c.type)),
        to = !list.every(isOn);
      list.forEach(c => (c[k] = to));
      redraw();
    }
    if (e.target.closest('[data-sbfont]'))
      return boardFontPop(
        e.target.closest('[data-sbfont]'),
        cs.filter(c => SIZED.includes(c.type)),
      );
    const fz = e.target.closest('[data-fs]');
    if (fz) {
      cs.filter(c => SIZED.includes(c.type)).forEach(c => {
        if (fz.dataset.fs === 'm') delete c.fs;
        else c.fs = fz.dataset.fs;
        fitNote(c);
      });
      redraw();
    }
    if (a === 'crop') return startCrop(one);
    const cr = e.target.closest('[data-crop]')?.dataset.crop;
    if (cr) return endCrop(cr);
    if (e.target.closest('[data-fill]')) return offerFill(spotsIn(cs));
    if (a === 'open') one.type === 'doc' ? openDoc(one) : openCanvas(one);
    if (a === 'visit') Fenmyr.openURL(one.url);
    if (a === 'vnflip') flipVNote(one);
    if (a === 'vnopen') openVNote(one);
    if (a === 'relink') {
      one.draft = one.url;
      one.url = '';
      one.image = '';
      one.h = 52;
      redraw();
    }
    if (a === 'head') {
      one.head = one.head === false ? true : false;
      redraw();
    }
    if (a === 'hidename') {
      one.hideName = !one.hideName;
      redraw();
    }
    if (a === 'hidehex') {
      one.hideHex = !one.hideHex;
      redraw();
    }
    if (a === 'pick') openColor(one);
    if (a === 'tag') {
      if (one.tagText) {
        delete one.tagText;
        redraw();
      } else editTag(one);
    } // tap again to take the label off
    if (a === 'edit') startEdit(one.id);
    if (a === 'del') removeSelected();
  };
}
