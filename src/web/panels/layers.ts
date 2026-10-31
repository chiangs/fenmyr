// @ts-nocheck
import { cardEl, esc } from '../ui/dom.ts';
import { renderAll, renderCard } from '../canvas/render.ts';
import { applyView } from '../canvas/view.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { layoutAll } from '../cards/kanban.ts';
import { CIC, host } from '../cards/shapes.ts';
import { $, cardsEl, stage, world } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { endEdit } from '../features/tags.ts';
import { chirp } from '../settings/licenses.ts';
import { pxSrc } from '../tools/stamps.ts';
import { renderPalette } from '../ui/colorPicker.ts';
import { session } from '../core/state.ts';

// ---------- layers: every piece on the board, top of the stack first (like Figma). Frames and collections fold open, groups stay together ----------
export const LY = { open: new Set(), t: 0, drag: null, html: '' };
let LICON;

const lyText = s =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SHAPE_N = { rect: 'Rectangle', circle: 'Circle', tri: 'Triangle', star: 'Star', heart: 'Heart', line: 'Line' };

function layerName(c) {
  if (c.type === 'section') return lyText(c.text) || 'Section';
  if (c.ln) return c.ln;
  const t = {
    frame: c.name || 'Screen',
    coll: c.name || c.text || (c.kanban ? 'Kanban' : 'Collection'),
    vnote: c.title || 'Vault note',
    note: lyText(c.name) || lyText(c.text),
    text: lyText(c.text),
    title: lyText(c.text),
    todo: lyText(c.text) || lyText(c.items?.[0]?.t),
    image: c.tagText || 'Image',
    link: c.title || (c.url ? host(c.url) : 'Link'),
    doc: c.text || 'Doc',
    canvas: c.text || 'Canvas',
    swatch: c.label || (c.hex || '').toUpperCase(),
    shape: SHAPE_N[c.shape || 'rect'],
    path: c.closed ? 'Pen shape' : 'Pen line',
    stamp: 'Stamp',
    icon: c.name || 'Icon',
    audio: 'Voice memo',
    video: c.title || 'Video',
    spotify: c.title || 'Spotify',
    ink: 'Drawing',
    box: c.img ? 'Image spot' : 'Box',
    font: c.font || 'Figtree',
  }[c.type];
  return t || { note: 'Note', text: 'Text', title: 'Title', todo: 'Checklist' }[c.type] || c.type;
}

function layerIcon(c) {
  if (c.type === 'section') return LICON.section;
  if (c.type === 'stamp') {
    const s = c.src || pxSrc(c.emoji || '⭐');
    return s ? `<img src="${esc(s)}" alt="">` : `<span class="ly-emo">${esc(c.emoji || '⭐')}</span>`;
  }
  if (c.type === 'swatch') return `<i class="ly-sw" style="background:${esc(c.hex)}"></i>`;
  if (c.type === 'icon') return Icon(c.name || 'star');
  return toolIcon(c.type) || LICON[c.type] || CIC[c.type] || LICON.box;
}

// the very same icon as the button you made it with (the toolbar, or the wireframe panel), so a piece looks the same in both places
const TOOL_OF = {
  ink: '[data-add="draw"]',
  frame: '[data-wf="frame"]',
  box: '[data-wf="box"]',
  icon: '[data-wf="icon"]',
  text: '[data-wf="text"]',
};
const toolIc = {};

function toolIcon(type) {
  if (type in toolIc) return toolIc[type];
  const svg = document.querySelector(`${TOOL_OF[type] || `.tools [data-add="${type}"]`} svg`);
  if (!svg) return (toolIc[type] = null);
  const k = svg.cloneNode(true);
  k.removeAttribute('width');
  k.removeAttribute('height');
  return (toolIc[type] = k.outerHTML); // only the outer size: the shapes inside keep theirs
}

// the tree: [{ key, ids, kind, c?, kids: [...] }], ordered top of the stack first (collections list their cards in reading order)
function layerTree() {
  const z = new Map([...cardsEl.children].map((el, i) => [el.dataset.id, i])),
    zOf = n => Math.max(...n.ids.map(i => z.get(i) ?? -1));
  const inColl = new Set(session.board.cards.filter(c => c.type === 'coll').flatMap(c => c.kids || [])),
    frames = new Set(session.board.cards.filter(c => c.type === 'frame').map(c => c.id));
  const secs = session.board.cards.filter(c => c.type === 'section').sort((a, b) => a.w * a.h - b.w * b.h),
    secOf = new Map();
  session.board.cards.forEach(c => {
    if (inColl.has(c.id) || (c.onFrame && frames.has(c.onFrame) && c.type !== 'frame')) return;
    const mx = c.x + c.w / 2,
      my = c.y + c.h / 2;
    const s = secs.find(
      s =>
        s.id !== c.id &&
        (c.type !== 'section' || s.w * s.h > c.w * c.h) &&
        mx > s.x &&
        mx < s.x + s.w &&
        my > s.y &&
        my < s.y + s.h,
    );
    if (s) secOf.set(c.id, s.id);
  });
  const nodesFor = cards => {
    const groups = new Map(),
      out = [];
    cards.forEach(c => {
      if (c.group) {
        if (!groups.has(c.group)) {
          const g = { key: 'g:' + c.group, kind: 'group', ids: [], kids: [] };
          groups.set(c.group, g);
          out.push(g);
        }
        groups.get(c.group).ids.push(c.id);
        groups.get(c.group).kids.push(nodeOf(c));
      } else out.push(nodeOf(c));
    });
    groups.forEach(g => g.kids.sort((a, b) => zOf(b) - zOf(a)));
    return out.sort((a, b) => zOf(b) - zOf(a));
  };
  const nodeOf = c => {
    const n = { key: c.id, kind: 'card', c, ids: [c.id], kids: [] };
    if (c.type === 'section') n.kids = nodesFor(session.board.cards.filter(k => secOf.get(k.id) === c.id)); // like a folder: what's inside sits under it
    if (c.type === 'frame')
      n.kids = nodesFor(
        session.board.cards.filter(k => k.id !== c.id && k.type !== 'frame' && k.onFrame === c.id && !inColl.has(k.id)),
      );
    if (c.type === 'coll')
      n.kids = (c.kids || [])
        .map(byId)
        .filter(Boolean)
        .map(k => ({ key: k.id, kind: 'card', c: k, ids: [k.id], kids: [], inColl: c.id }));
    return n;
  };
  return nodesFor(
    session.board.cards.filter(
      c => !inColl.has(c.id) && !secOf.has(c.id) && !(c.onFrame && frames.has(c.onFrame) && c.type !== 'frame'),
    ),
  );
}

// a group goes by its own name, or by the words inside it (a button reads "Get started"), so the list never fills up with "Group, Group, Group"
const groupName = ids => {
  const cs = ids.map(byId).filter(Boolean);
  if (cs[0]?.gn) return cs[0].gn;
  const t = cs
    .filter(c => ['text', 'title', 'note'].includes(c.type))
    .map(c => lyText(c.text))
    .filter(Boolean)[0];
  return t || (cs.some(c => c.type === 'box' && c.img) ? 'Image spot' : 'Group');
};

const lyAll = n => (n.kind === 'group' ? n.ids : [...n.ids, ...n.kids.flatMap(lyAll)]);

export function renderLayers() {
  const list = $('layers');
  if (!list || !session.board) return;
  if (list.querySelector('[contenteditable="true"]')) return; // never rebuild under someone renaming
  const tree = layerTree();
  $('layerCount').textContent = session.board.cards.length || '';
  // open whatever holds the selection, so a picked piece is always visible in the list
  const walk = (ns, up) =>
    ns.forEach(n => {
      if (n.ids.some(i => session.sel.has(i)) && !(n.kind === 'group' && n.ids.every(i => session.sel.has(i))))
        up.forEach(k => LY.open.add(k));
      walk(n.kids, [...up, n.key]);
    });
  walk(tree, []);
  const row = (n, depth) => {
    const c = n.c,
      kids = n.kids.length,
      open = LY.open.has(n.key),
      ids = lyAll(n),
      hidden = ids.length && ids.every(i => byId(i)?.hidden),
      locked = ids.length && ids.every(i => byId(i)?.locked);
    const name = n.kind === 'group' ? groupName(n.ids) : layerName(c),
      icon = n.kind === 'group' ? LICON.group : layerIcon(c);
    return (
      `<div class="ly${n.ids.every(i => session.sel.has(i)) ? ' on' : ''}${hidden ? ' off' : ''}${locked ? ' lk' : ''}${c?.type === 'frame' || c?.type === 'coll' || c?.type === 'section' || n.kind === 'group' ? ' parent' : ''}" data-key="${esc(n.key)}" draggable="true" style="--d:${depth}">
        <button class="ly-tw${kids ? '' : ' none'}${open ? ' open' : ''}" tabindex="-1" aria-label="${open ? 'Close' : 'Open'}">${Icon('caret-right')}</button>
        <span class="ly-ic">${icon}</span><span class="ly-n">${esc(name)}</span>
        <button class="ly-b ly-lock" title="${locked ? 'Unlock' : 'Lock'}">${Icon(locked ? 'lock' : 'unlock')}</button>
        <button class="ly-b ly-eye" title="${hidden ? 'Show' : 'Hide'}">${Icon(hidden ? 'eye-off' : 'eye')}</button>
      </div>` + (kids && open ? n.kids.map(k => row(k, depth + 1)).join('') : '')
    );
  };
  const st = list.scrollTop;
  const html = tree.length
    ? tree.map(n => row(n, 0)).join('')
    : '<div class="ly-empty">Nothing on this board yet. Everything you add shows up here.</div>';
  // moving a card changes nothing here, and rewriting hundreds of rows costs more than the rest of an edit
  if (html !== LY.html) {
    LY.html = html;
    list.innerHTML = html;
    list.scrollTop = st;
  }
  LY.tree = tree;
  const on = list.querySelector('.ly.on');
  if (on && LY.reveal) {
    LY.reveal = false;
    const r = on.getBoundingClientRect(),
      lr = list.getBoundingClientRect();
    if (r.top < lr.top || r.bottom > lr.bottom) on.scrollIntoView({ block: 'nearest' });
  }
}

export const layersSoon = () => {
  cancelAnimationFrame(LY.t);
  LY.t = requestAnimationFrame(renderLayers);
};

const lyFind = (key, ns = LY.tree || []) => {
  for (const n of ns) {
    if (n.key === key) return n;
    const f = lyFind(key, n.kids);
    if (f) return f;
  }
  return null;
};

const lyHL = (ids, on) => ids.forEach(i => cardEl(i)?.classList.toggle('ly-hl', on));

export function wireLayers() {
  const list = $('layers');
  if (!list || list.dataset.wired) return;
  list.dataset.wired = 1;
  list.addEventListener('pointerover', e => {
    const r = e.target.closest('.ly');
    cardsEl.querySelectorAll('.ly-hl').forEach(el => el.classList.remove('ly-hl'));
    if (r) {
      const n = lyFind(r.dataset.key);
      n && lyHL(lyAll(n), true);
    }
  });
  list.addEventListener('pointerleave', () =>
    cardsEl.querySelectorAll('.ly-hl').forEach(el => el.classList.remove('ly-hl')),
  );
  // right-click a layer: the same menu as right-clicking that thing on the board (it gets selected first, if it isn't already)
  list.addEventListener('contextmenu', e => {
    const r = e.target.closest('.ly');
    if (!r) return;
    const n = lyFind(r.dataset.key);
    if (!n) return;
    e.preventDefault();
    e.stopPropagation();
    const ids = n.ids.filter(i => byId(i));
    if (!ids.length) return;
    if (!ids.every(i => session.sel.has(i))) {
      endEdit();
      selectOnly(ids);
      renderLayers();
    }
    stage.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }),
    );
  });
  list.addEventListener('click', e => {
    const r = e.target.closest('.ly');
    if (!r) return;
    const n = lyFind(r.dataset.key);
    if (!n) return;
    if (e.target.closest('.ly-tw')) {
      LY.open.has(n.key) ? LY.open.delete(n.key) : LY.open.add(n.key);
      return renderLayers();
    }
    if (e.target.closest('.ly-eye')) {
      remember();
      const ids = lyAll(n),
        hide = !ids.every(i => byId(i)?.hidden);
      ids.forEach(i => {
        const c = byId(i);
        if (c) {
          c.hidden = hide || undefined;
          renderCard(c);
        }
      });
      if (hide) selectOnly([...session.sel].filter(i => !ids.includes(i)));
      renderWires();
      save();
      return renderLayers();
    }
    if (e.target.closest('.ly-lock')) {
      remember();
      const ids = lyAll(n),
        lock = !ids.every(i => byId(i)?.locked);
      ids.forEach(i => {
        const c = byId(i);
        if (c) {
          c.locked = lock || undefined;
          renderCard(c);
        }
      });
      if (lock) selectOnly([...session.sel].filter(i => !ids.includes(i)));
      save();
      return renderLayers();
    }
    if (n.ids.some(i => byId(i)?.hidden || byId(i)?.locked)) return; // hidden or locked pieces can't be picked until they're shown/unlocked
    endEdit();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const all = n.ids.every(i => session.sel.has(i));
      n.ids.forEach(i => (all ? session.sel.delete(i) : session.sel.add(i)));
      selectOnly([...session.sel]);
    } else selectOnly(n.ids);
    lyBringIntoView(n.ids);
    lyFlash(lyAll(n));
    renderLayers();
    const now = Date.now(),
      again = LY.lastClick && LY.lastClick.key === n.key && now - LY.lastClick.t < 450;
    LY.lastClick = again ? null : { key: n.key, t: now };
    if (again) setTimeout(() => lyRename(n.key), 0);
  });
  function lyRename(key) {
    const r = list.querySelector(`.ly[data-key="${CSS.escape(key)}"]`),
      nm = r?.querySelector('.ly-n');
    if (!nm) return;
    const n = lyFind(key);
    if (!n) return;
    LY.html = '';
    nm.contentEditable = 'true';
    nm.focus();
    getSelection().selectAllChildren(nm);
    r.draggable = false;
    const done = ok => {
      nm.contentEditable = 'false';
      r.draggable = true;
      const v = nm.textContent.trim();
      nm.onblur = nm.onkeydown = null;
      if (ok) {
        remember();
        if (n.kind === 'group')
          n.ids.forEach(i => {
            const c = byId(i);
            if (c) c.gn = v || undefined;
          });
        else {
          const c = n.c;
          if (c.type === 'frame' || c.type === 'coll') {
            c.name = v || c.name;
            renderCard(c);
          } // frames and collections rename on the board too
          else if (c.type === 'section') {
            if (v) {
              c.text = v;
              renderCard(c);
            }
          } else if (c.type === 'swatch') {
            if (v && v !== c.label) {
              const p = session.board.palette.find(x => x.hex === c.hex);
              c.label = v;
              c.autoName = false;
              if (p) {
                p.name = v;
                renderPalette();
              }
              renderCard(c);
              chirp(`Renamed the colour to “${v}” ✓`, 2600);
            }
          } // a color card: its color gets the new name (and the saved board color too)
          else c.ln = v && v !== layerName({ ...c, ln: '' }) ? v : undefined;
        }
        save();
      }
      renderLayers();
    };
    nm.onkeydown = ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        done(true);
      }
      if (ev.key === 'Escape') done(false);
    };
    nm.onblur = () => done(true);
  }
  list.addEventListener('dblclick', e => {
    const r = e.target.closest('.ly');
    if (r && !e.target.closest('.ly-b, .ly-tw')) setTimeout(() => lyRename(r.dataset.key), 0);
  });
  // drag rows to restack (or, inside a collection, to reorder its cards). Only between neighbors that share the same parent
  list.addEventListener('dragstart', e => {
    const r = e.target.closest('.ly');
    if (!r) return;
    LY.drag = r.dataset.key;
    r.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', '');
    } catch (er) {}
  });
  const parentKey = key => {
    const find = (ns, p) => {
      for (const n of ns) {
        if (n.key === key) return p;
        const f = find(n.kids, n.key);
        if (f !== undefined) return f;
      }
      return undefined;
    };
    return find(LY.tree || [], '');
  };
  list.addEventListener('dragover', e => {
    const r = e.target.closest('.ly');
    list.querySelectorAll('.drop-a, .drop-b').forEach(x => x.classList.remove('drop-a', 'drop-b'));
    if (!r || !LY.drag || r.dataset.key === LY.drag || parentKey(r.dataset.key) !== parentKey(LY.drag)) return;
    e.preventDefault();
    const b = r.getBoundingClientRect();
    r.classList.add(e.clientY < b.top + b.height / 2 ? 'drop-a' : 'drop-b');
  });
  list.addEventListener('dragend', () => {
    LY.drag = null;
    list
      .querySelectorAll('.dragging, .drop-a, .drop-b')
      .forEach(x => x.classList.remove('dragging', 'drop-a', 'drop-b'));
  });
  list.addEventListener('drop', e => {
    const r = e.target.closest('.drop-a, .drop-b');
    if (!r || !LY.drag) return;
    e.preventDefault();
    const above = r.classList.contains('drop-a');
    const mv = lyFind(LY.drag),
      tg = lyFind(r.dataset.key);
    if (!mv || !tg) return;
    remember();
    if (mv.inColl) {
      const co = byId(mv.inColl),
        k = (co.kids || []).filter(i => i !== mv.c.id),
        at = k.indexOf(tg.c.id);
      k.splice(above ? at : at + 1, 0, mv.c.id);
      co.kids = k;
      layoutAll();
    } else {
      const ids = lyAll(mv),
        moving = session.board.cards.filter(c => ids.includes(c.id)),
        rest = session.board.cards.filter(c => !ids.includes(c.id)),
        tIdx = lyAll(tg)
          .map(i => rest.findIndex(c => c.id === i))
          .filter(i => i >= 0);
      // the list is top-first, so "above" in the list means higher in the stack: after the target in the cards
      const at = above ? Math.max(...tIdx) + 1 : Math.min(...tIdx);
      rest.splice(at, 0, ...moving);
      session.board.cards = rest;
      renderAll();
    }
    save();
    renderLayers();
  });
}

// Myra points it out: a soft pink glow pulses around the piece and she pops up on its corner with a wave, then both fade
export function lyFlash(ids) {
  const cs = ids.map(byId).filter(c => c && !c.hidden);
  if (!cs.length) return;
  world.querySelectorAll('.ly-flash').forEach(f => f.remove());
  const pad = 10 / session.view.z,
    x0 = Math.min(...cs.map(c => c.x)) - pad,
    y0 = Math.min(...cs.map(c => c.y)) - pad,
    x1 = Math.max(...cs.map(c => c.x + c.w)) + pad,
    y1 = Math.max(...cs.map(c => c.y + c.h)) + pad;
  const f = document.createElement('div');
  f.className = 'ly-flash';
  f.style.setProperty('--iz', (1 / session.view.z).toFixed(4));
  Object.assign(f.style, { left: x0 + 'px', top: y0 + 'px', width: x1 - x0 + 'px', height: y1 - y0 + 'px' });
  f.innerHTML =
    '<i class="lf-ring"></i><i class="lf-ring two"></i><img class="lf-myra" src="stamps/myra-wave.png" alt=""><b class="lf-spark">✦</b>';
  world.appendChild(f);
  setTimeout(() => f.classList.add('out'), 1500);
  setTimeout(() => f.remove(), 1900);
}

function lyBringIntoView(ids) {
  const cs = ids.map(byId).filter(Boolean);
  if (!cs.length) return;
  const r = stage.getBoundingClientRect();
  const x0 = Math.min(...cs.map(c => c.x)),
    y0 = Math.min(...cs.map(c => c.y)),
    x1 = Math.max(...cs.map(c => c.x + c.w)),
    y1 = Math.max(...cs.map(c => c.y + c.h));
  const sx0 = x0 * session.view.z + session.view.x,
    sy0 = y0 * session.view.z + session.view.y,
    sx1 = x1 * session.view.z + session.view.x,
    sy1 = y1 * session.view.z + session.view.y;
  const L = document.body.classList.contains('phone') ? 0 : 270; // the side panels' room (none on a phone)
  if (sx0 > L + 10 && sx1 < r.width - 40 && sy0 > 60 && sy1 < r.height - 100) return; // already on screen
  const tx = L + (r.width - L) / 2 - ((x0 + x1) / 2) * session.view.z,
    ty = r.height / 2 - ((y0 + y1) / 2) * session.view.z,
    fx = session.view.x,
    fy = session.view.y,
    t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 320),
      e = 1 - Math.pow(1 - k, 3);
    session.view.x = fx + (tx - fx) * e;
    session.view.y = fy + (ty - fy) * e;
    applyView();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
export function init13() {
  LICON = {
    path: Icon('path'),
    section: Icon('section'),
    note: Icon('note'),
    todo: Icon('checklist'),
    title: Icon('title'),
    text: Icon('text'),
    image: Icon('image'),
    audio: Icon('mic'),
    ink: Icon('draw'),
    frame: Icon('screen'),
    box: Icon('rectangle'),
    font: Icon('font'),
    coll: Icon('collection'),
    group: Icon('group'),
    shape: Icon('shapes'),
    icon: Icon('smiley'),
  };
}
