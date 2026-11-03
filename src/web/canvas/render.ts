import type { Card } from '../../shared/model.ts';
import { cardEl, esc, oneIn } from '../ui/dom.ts';
import { typesWith } from '../../shared/cardTypes.ts';
import { applyView } from './view.ts';
import { renderTray, renderWires } from './wires.ts';
import { COLL, parentOf } from '../cards/collection.ts';
import { layoutAll } from '../cards/kanban.ts';
import { wireLinkInput } from '../cards/links.ts';
import { spEmbed } from '../cards/spotify.ts';
import { COLORS, find } from '../core/base.ts';
import { cardsEl } from '../core/dom.ts';
import { dueChip } from '../features/due.ts';
import { isDim } from '../features/focus.ts';
import { soloTagAdd } from '../features/tags.ts';
import { mini } from '../library/homeTiles.ts';
import { fitAudio } from '../media/audio.ts';
import { setupVideo } from '../media/video.ts';
import { layersSoon } from '../panels/layers.ts';
import { wireLayers } from '../panels/layerEvents.ts';
import { fsMul, SIZED } from '../selbar/textSize.ts';
import { applyColors } from '../settings/colors.ts';
import { useFont } from '../wireframe/tilt.ts';
import { WF, styleWF } from '../wireframe/wireframes.ts';
import { session } from '../core/state.ts';
import { inner } from './cardMarkup.ts';

// ---------- rendering ----------

// which cards can be tilted by hand: everything except the things that hold other things (sections, screens, collections) and wireframe pieces (they rotate their own way)
const NO_TILT = typesWith('noTilt');
export const TILTS = (c: Card) => !NO_TILT.includes(c.type);
// strokes: boxes and screens get a border (solid or dashed); titles, wireframe text and icons get an outline around the letters
const STROKABLE = typesWith('strokable');
export const STROKE_TEXT = ['title', 'text', 'icon'];

export const canStroke = (c: Card) => STROKABLE.includes(c.type) && !(c.type === 'shape' && c.shape === 'line');

// boxes and screens: the line is drawn (an SVG rect) so it can be solid, dashed or dotted with your own dash length and gap, like Figma
export const skStyle = (c: { sdash?: boolean | string }) => (c.sdash === true ? 'dash' : c.sdash || 'solid');

export function applyStroke(c: Card, el: HTMLElement) {
  if (c.type === 'title') {
    const t = oneIn(el, '.text');
    if (t) t.style.color = c.tc && c.tc !== 'none' ? c.tc : '';
  } // a title's own text color (applied after its text is drawn)
  if (!canStroke(c)) return;
  const on = !!(c.stroke && (c.sw ?? 0) > 0);
  el.classList.toggle('has-stroke', on);
  if (on) {
    el.style.setProperty('--sk', c.stroke ?? '');
    el.style.setProperty('--skw', `${c.sw}px`);
  } else {
    el.style.removeProperty('--sk');
    el.style.removeProperty('--skw');
  }
  if (c.type !== 'box' && c.type !== 'frame') return;
  let svg = el.querySelector(':scope > .sk-svg');
  if (!on) {
    svg?.remove();
    return;
  }
  if (!svg) {
    el.insertAdjacentHTML(
      'beforeend',
      '<svg class="sk-svg" aria-hidden="true"><rect x="0" y="0" width="100%" height="100%"/></svg>',
    );
    svg = el.querySelector(':scope > .sk-svg');
  }
  const st = skStyle(c),
    w = c.sw ?? 0,
    r = Math.max(0, (c.type === 'frame' ? (c.radius ?? 0) : c.radius || 0) - w / 2),
    rect = svg?.firstElementChild;
  if (!rect) return;
  rect.setAttribute('rx', String(r));
  rect.setAttribute('ry', String(r));
  rect.setAttribute('stroke', c.stroke ?? '');
  rect.setAttribute('stroke-width', String(w));
  rect.setAttribute(
    'stroke-dasharray',
    st === 'dash' ? `${c.dl ?? 8} ${c.dg ?? 6}` : st === 'dot' ? `0 ${(c.dg ?? 6) + w}` : 'none',
  );
  rect.setAttribute('stroke-linecap', st === 'dot' ? 'round' : c.cap === 'round' ? 'round' : 'butt');
}

export const titleW = (c: Card) => (c.type === 'title' && !c.fixedW ? 'max-content' : c.w + 'px');

export function renderCard(c: Card, pop?: boolean) {
  let el = cardEl(c.id);
  if (!el) {
    el = document.createElement('div');
    el.dataset.id = c.id;
    cardsEl.appendChild(el);
    if (pop) el.classList.add('pop');
  }
  el.className =
    `card ${c.type}` +
    (session.sel.has(c.id) ? ' sel' : '') +
    (isDim(c) ? ' dim' : '') +
    (find.cur === c.id ? ' find-cur' : '') +
    (pop ? ' pop' : '');
  Object.assign(el.style, {
    left: c.x + 'px',
    top: c.y + 'px',
    width: titleW(c),
    height: c.type === 'title' ? 'auto' : c.h + 'px',
  });
  el.classList.toggle('ly-off', !!c.hidden);
  el.classList.toggle('ly-lock', !!c.locked);
  el.classList.toggle('fixedw', !!c.fixedW);
  applyStroke(c, el);
  if (c.type === 'title' || c.type === 'text')
    el.classList.toggle('no-fill', (c.type === 'title' ? c.tc : c.color) === 'none');
  if (SIZED.includes(c.type)) {
    el.style.setProperty('--ta', c.align || 'left');
    el.style.setProperty(
      '--tt',
      c.tcase === 'upper'
        ? 'uppercase'
        : c.tcase === 'lower'
          ? 'lowercase'
          : c.tcase === 'title'
            ? 'capitalize'
            : 'none',
    ); // Case: how the words show (what you typed stays as typed)
    if (c.lh != null) el.style.setProperty('--lh', String(c.lh));
    else el.style.removeProperty('--lh');
    el.classList.toggle('has-lh', c.lh != null);
    if (c.ls != null) el.style.setProperty('--ls', c.ls / 100 + 'em');
    else el.style.removeProperty('--ls');
    el.classList.toggle('has-ls', c.ls != null);
  }
  if (c.type === 'title')
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      if (!c.fixedW && el.offsetWidth) c.w = el.offsetWidth;
      if (el.offsetHeight) c.h = el.offsetHeight;
    });
  el.style.setProperty('--tilt', `${c.type === 'stamp' && !c.tilted ? 0 : c.r}deg`);
  const named = c.color && COLORS[c.color] ? c.color : '';
  el.style.setProperty('--fill', named ? (COLORS[named] ?? '#fff') : '#fff');
  el.classList.add(`c-${named && named !== 'white' ? named : 'white'}`);
  if (c.type === 'swatch') el.style.setProperty('--hex', c.hex);
  el.style.setProperty('--fs', String(fsMul(c)));
  el.classList.toggle('has-font', !!c.font && SIZED.includes(c.type));
  if (c.font && SIZED.includes(c.type)) {
    el.style.setProperty('--cf', `"${String(c.font).replace(/"/g, '')}"`);
    useFont(c.font);
  } else el.style.removeProperty('--cf');
  for (const k of ['bold', 'italic', 'under', 'strike'] as const) {
    el.classList.toggle(`t-${k}`, c[k] === true);
    el.classList.toggle(`t-no${k}`, c[k] === false);
  }
  if (c.type === 'doc') el.classList.toggle('has-body', !!(c.body || '').trim());
  if (c.type === 'audio') {
    el.classList.toggle('paused', !!c.paused);
    if (!c.rec) requestAnimationFrame(() => fitAudio(c, el));
  }
  if (c.type === 'stamp') {
    el.style.setProperty('--sz', c.w + 'px');
    if (c.mv) el.classList.add('mv-' + c.mv);
  }
  if (c.type === 'link') el.classList.toggle('compact', !c.url || !c.image);
  if (c.type === 'canvas' && c.board)
    mini(c.board).then(svg => {
      const p = el.querySelector('.cv-prev');
      if (p && svg) p.innerHTML = svg;
    });
  if (c.type === 'link' && !c.url) setTimeout(() => wireLinkInput(c), 0);
  if (c.type === 'coll') {
    const t = (c.color && COLL[c.color]) || COLL.pink;
    el.style.setProperty('--chead', t?.[0] ?? '');
    el.style.setProperty('--cframe', t?.[1] ?? '');
    el.classList.toggle('nohead', c.head === false);
    el.style.height = c.h + 'px';
  } else if (parentOf(c.id)) el.classList.add('inside');
  if (c.type === 'spotify') {
    const fr = el.querySelector('.sp-frame');
    if (fr instanceof HTMLElement && fr.dataset.src === spEmbed(c)) {
      const t = el.querySelector('.sp-head span');
      if (t) t.textContent = c.title || 'Spotify';
      const tg = el.querySelector(':scope > .tag');
      if (tg) tg.textContent = c.tagText || '';
      if (!!tg === !!c.tagText) return el;
    }
  }
  el.innerHTML = `<div class="frame"></div><div class="body">${inner(c)}</div>${c.tagText ? `<div class="tag">${esc(c.tagText)}</div>` : ''}${dueChip(c)}${soloTagAdd(c)}<div class="knob"></div><div class="handle"></div>${TILTS(c) ? '<i class="rot-h" title="Drag to tilt"></i>' : ''}`;
  if (c.type === 'video') setupVideo(c, el);
  if (WF.includes(c.type))
    styleWF(c, el); // after the insides exist
  else applyStroke(c, el);
  if (c.type === 'image') el.style.setProperty('--img-r', (c.radius ?? 12) + 'px');
  return el;
}

// a card on a screen always sits above its screen in the stack (older boards could have them the other way round, which didn't show while screens were pinned to the back)
function keepOnScreens() {
  const at = new Map(session.board.cards.map((c, i) => [c.id, i]));
  const before = (c: Card) => {
    const frame = c.onFrame ? at.get(c.onFrame) : undefined;
    return frame !== undefined && (at.get(c.id) ?? 0) < frame;
  };
  if (!session.board.cards.some(before)) return;
  const kids = new Map<string, Card[]>();
  session.board.cards.forEach(c => {
    if (c.onFrame && before(c)) kids.set(c.onFrame, [...(kids.get(c.onFrame) ?? []), c]);
  });
  const moving = new Set([...kids.values()].flat()),
    out: Card[] = [];
  session.board.cards.forEach(c => {
    if (moving.has(c)) return;
    out.push(c);
    (kids.get(c.id) || []).forEach(k => out.push(k));
  });
  session.board.cards = out;
}

export function renderAll() {
  keepOnScreens();
  wireLayers();
  layersSoon();
  applyColors();
  cardsEl.innerHTML = '';
  session.board.cards.filter(c => c.type === 'coll').forEach(c => renderCard(c));
  session.board.cards.filter(c => c.type !== 'coll').forEach(c => renderCard(c));
  layoutAll();
  renderWires();
  renderTray();
  applyView();
}
