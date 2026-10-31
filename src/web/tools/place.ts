// @ts-nocheck
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { colorName } from '../cards/colorNames.ts';
import { collAt, dropInto } from '../cards/kanban.ts';
import { shapeSVG } from '../cards/shapes.ts';
import { clamp } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { startEdit } from '../features/tags.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { coolMic } from '../media/audio.ts';
import { readyToRecord } from '../media/devices.ts';
import { camOn } from '../media/video.ts';
import { card, newBoard } from '../model/boards.ts';
import { newNoteColor, snapTo, tip } from '../settings/licenses.ts';
import { addCard } from './penEdit.ts';
import { stampAt, stampHTML } from './stamps.ts';
import { openColor } from '../ui/colorPicker.ts';
import { PIECES, pickWF, placePiece } from '../wireframe/pieces.ts';
import { fileIntoFrame } from '../wireframe/tilt.ts';
import { DEVICES, WF } from '../wireframe/wireframes.ts';
import { session } from '../core/state.ts';

// ---------- placing: pick a tool, the new thing rides on your cursor, click to drop it, then type ----------
export let placing = null;
export let mouse = { x: 0, y: 0 };

const PLACE = {
  note: ['Note', [220, 120]],
  todo: ['Checklist', [240, 170]],
  title: ['Title', [300, 56]],
  coll: ['Collection', [288, 200]],
  swatch: ['Colour', [120, 150]],
  doc: ['Doc', [240, 52]],
  canvas: ['Canvas', [260, 180]],
  link: ['Paste a link', [260, 52]],
  shape: ['', [160, 160]],
  stamp: ['', [56, 56]],
  audio: ['Voice memo', [290, 150]],
  piece: ['', [300, 60]],
  icon: ['', [28, 28]],
  frame: ['Screen', [393, 852]],
  text: ['Text', [220, 26]],
  box: ['Drag to draw a box', [160, 100]],
  video: ['Video', [360, 246]],
};

export function startPlacing(type, extra = {}, quiet = false) {
  if (placing?.type === type && placing.extra?.shape === extra.shape) return stopPlacing();
  stopPlacing();
  placing = { type, extra };
  selectOnly([]);
  const g = $('ghost'),
    [label, [w, h]] = PLACE[type];
  g.className = 'ghost on ' + type;
  g.innerHTML = `<span>${label}</span>`;
  g.style.width = w + 'px';
  g.style.height = (extra.shape === 'line' ? 24 : h) + 'px';
  if (type === 'shape') g.innerHTML = shapeSVG({ shape: extra.shape });
  if (type === 'piece') {
    const P = PIECES[extra.piece],
      items = P.make(P.w || 360),
      W = Math.max(...items.map(i => i.x + i.w)),
      H = Math.max(...items.map(i => i.y + i.h));
    g.style.width = W + 'px';
    g.style.height = H + 'px';
    g.querySelector('span').textContent = extra.piece;
  }
  if (type === 'icon') {
    g.innerHTML = Icon(extra.name, { cls: 'ci', size: 28 });
    g.style.width = g.style.height = '28px';
  }
  if (type === 'frame' && DEVICES[extra.device]) {
    g.style.width = DEVICES[extra.device][0] + 'px';
    g.style.height = DEVICES[extra.device][1] + 'px';
    g.querySelector('span').textContent = extra.device;
  }
  if (type === 'stamp') {
    const st = extra.stamp;
    g.innerHTML = stampHTML(st);
    g.style.width = g.style.height = '56px';
  }
  moveGhost();
  stage.classList.add('placing');
  if (!quiet) {
    const h = $('placeHint');
    h.textContent =
      (type === 'box' ? 'Drag on the board to draw it' : 'Click the board to place it') + ' · Esc to cancel';
    h.hidden = false;
  }
  $('tools').querySelector(`[data-add="${type}"]`)?.classList.add('on');
}

export function stopPlacing() {
  if (placing?.type === 'audio') setTimeout(coolMic, 15000);
  $('shapePick').classList.remove('on');
  $('tplPick').classList.remove('on');
  $('stampWheel').classList.remove('on');
  $('stampPick').classList.remove('on');
  placing = null;
  $('ghost').className = 'ghost';
  $('placeHint').hidden = true;
  document.body.classList.remove('dz-dragging');
  stage.classList.remove('placing');
  $('tools')
    .querySelectorAll('.on')
    .forEach(b => b.classList.remove('on'));
}

function moveGhost() {
  if (!placing) return;
  const g = $('ghost'),
    o = placing.type === 'stamp' ? 28 * session.view.z : 14;
  g.style.left = mouse.x - o + 'px';
  g.style.top = mouse.y - o + 'px';
  g.style.transform = `scale(${session.view.z})`;
}

export function placeAt(w) {
  if (placing.type === 'stamp') return stampAt(w, placing.extra.stamp);
  if (placing.type === 'piece') {
    const n = placing.extra.piece;
    stopPlacing();
    document.querySelectorAll('.dz-piece-grid .on').forEach(x => x.classList.remove('on'));
    return placePiece(n, w);
  }
  const type = placing.type,
    more = placing.extra || {};
  stopPlacing();
  const dev = DEVICES[more.device],
    extra =
      type === 'icon'
        ? { name: more.name || 'star', color: '#27272a', w: 28, h: 28, r: 0 }
        : type === 'frame'
          ? {
              name: more.device === 'Desktop' ? 'Desktop' : 'Screen',
              device: more.device || 'Custom',
              w: dev ? dev[0] : 393,
              h: dev ? dev[1] : 852,
              radius: dev ? dev[2] : 0,
              fill: '#ffffff',
              r: 0,
            }
          : type === 'text'
            ? { text: '', size: 18, weight: 500, font: 'Figtree', color: '#27272a', r: 0 }
            : type === 'audio'
              ? { r: 0 }
              : type === 'doc'
                ? { text: '', body: '' }
                : type === 'canvas'
                  ? { text: '' }
                  : type === 'link'
                    ? { url: '' }
                    : type === 'shape'
                      ? { shape: more.shape, fill: 'gray', text: '', r: 0 }
                      : type === 'note'
                        ? { name: '', color: newNoteColor() }
                        : type === 'todo'
                          ? { text: '', items: [{ t: 'first thing', done: false }] }
                          : type === 'title'
                            ? { text: '' }
                            : type === 'coll'
                              ? { text: '', color: 'pink', kids: [], cols: 1 }
                              : type === 'swatch'
                                ? { hex: '#f6b45e', label: 'Pink' }
                                : {};
  const c = card(type, extra);
  c.x = snapTo(w.x - 14 / session.view.z);
  c.y = snapTo(w.y - 14 / session.view.z);
  if (type === 'coll') c.r = 0;
  if (type === 'link') c.h = 52;
  if (type === 'shape' && more.shape === 'line') {
    c.w = 200;
    c.h = 24;
  }
  if (window.__phone?.on) {
    // a finger has no ghost to aim with: center it on the tap, and keep it on screen
    const r = stage.getBoundingClientRect(),
      z = session.view.z,
      wl = (r.left + 12 - session.view.x) / z,
      wr = (r.right - 12 - session.view.x) / z,
      wt = (r.top + 70 - session.view.y) / z,
      wb = (r.bottom - 100 - session.view.y) / z;
    c.x = snapTo(clamp(w.x - c.w / 2, wl, Math.max(wl, wr - c.w)));
    c.y = snapTo(clamp(w.y - c.h / 2, wt, Math.max(wt, wb - c.h)));
  }
  if (type === 'swatch') {
    c.label = colorName(c.hex);
    c.autoName = true;
  }
  if (type === 'canvas') {
    const child = newBoard('Untitled canvas');
    child.parent = session.board.id;
    child.folder = session.board.folder || null;
    c.board = child.id;
    Fenmyr.save(child).then(refreshBoards);
  }
  addCard(c);
  selectOnly([c.id]);
  if (type === 'note' && session.board.cards.filter(x => x.type === 'note' && !parentOf(x.id)).length === 6)
    tip("That's a lot of loose notes! Want me to sort them into collections? Just ask ✦");
  const t = type !== 'coll' && collAt(w, new Set([c.id]));
  if (t) {
    dropInto(t, [c.id], w);
    save();
  }
  if (WF.includes(type)) {
    fileIntoFrame([c]);
    pickWF(null);
  }
  if (['note', 'todo', 'title', 'doc', 'canvas', 'text'].includes(type)) startEdit(c.id); // ready to type right away, so the first letters never act as shortcuts
  if (type === 'coll') startEdit(c.id);
  if (type === 'swatch') setTimeout(() => openColor(c), 60);
  if (type === 'audio') {
    c.ready = true;
    renderCard(c);
    selectOnly([c.id]);
    save();
    readyToRecord().then(() => renderCard(c));
  }
  if (type === 'video') {
    c.ready = true;
    renderCard(c);
    selectOnly([c.id]);
    save();
    camOn(c);
  } // it waits for Start recording, so nothing records by surprise
}
export function init41() {
  addEventListener(
    'pointermove',
    e => {
      mouse = { x: e.clientX, y: e.clientY };
      moveGhost();
    },
    true,
  );
}
