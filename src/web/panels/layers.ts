import type { Card } from '../../shared/model.ts';
import { applyView } from '../canvas/view.ts';
import { byId } from '../canvas/wires.ts';
import { $, cardsEl, stage, world } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { plainOf } from '../richtext/render.ts';
import { cardEl, esc } from '../ui/dom.ts';
import { initLayerIcons, LICON, layerIcon, layerName, lyText } from './layerNames.ts';

// ---------- layers: every piece on the board, top of the stack first (like Figma). Frames and collections fold open, groups stay together ----------
// key: a card id, or 'g:' and a group id; inColl: the collection a card sits in, which it can be reordered within
export type LayerNode = {
  key: string;
  kind: 'group' | 'card';
  ids: string[];
  kids: LayerNode[];
  c?: Card;
  inColl?: string;
};
// reveal: scroll the selection into view at the next render
export const LY: {
  open: Set<string>;
  t: number;
  drag: string | null;
  html: string;
  tree: LayerNode[];
  reveal: boolean;
  lastClick: { key: string; t: number } | null;
} = { open: new Set(), t: 0, drag: null, html: '', tree: [], reveal: false, lastClick: null };
// the tree: [{ key, ids, kind, c?, kids: [...] }], ordered top of the stack first (collections list their cards in reading order)
function layerTree() {
  const z = new Map<string, number>(),
    zOf = (n: LayerNode) => Math.max(...n.ids.map(i => z.get(i) ?? -1));
  [...cardsEl.children].forEach((el, i) => {
    if (el instanceof HTMLElement && el.dataset.id) z.set(el.dataset.id, i);
  });
  const inColl = new Set(session.board.cards.flatMap(c => (c.type === 'coll' ? c.kids : []))),
    frames = new Set(session.board.cards.filter(c => c.type === 'frame').map(c => c.id));
  const secs = session.board.cards.filter(c => c.type === 'section').sort((a, b) => a.w * a.h - b.w * b.h),
    secOf = new Map<string, string>();
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
  const nodesFor = (cards: Card[]): LayerNode[] => {
    const groups = new Map<string, LayerNode>(),
      out: LayerNode[] = [];
    cards.forEach(c => {
      if (c.group) {
        let g = groups.get(c.group);
        if (!g) {
          g = { key: `g:${c.group}`, kind: 'group', ids: [], kids: [] };
          groups.set(c.group, g);
          out.push(g);
        }
        g.ids.push(c.id);
        g.kids.push(nodeOf(c));
      } else out.push(nodeOf(c));
    });
    groups.forEach(g => {
      g.kids.sort((a, b) => zOf(b) - zOf(a));
    });
    return out.sort((a, b) => zOf(b) - zOf(a));
  };
  const nodeOf = (c: Card): LayerNode => {
    const n: LayerNode = { key: c.id, kind: 'card', c, ids: [c.id], kids: [] };
    if (c.type === 'section') n.kids = nodesFor(session.board.cards.filter(k => secOf.get(k.id) === c.id)); // like a folder: what's inside sits under it
    if (c.type === 'frame')
      n.kids = nodesFor(
        session.board.cards.filter(k => k.id !== c.id && k.type !== 'frame' && k.onFrame === c.id && !inColl.has(k.id)),
      );
    if (c.type === 'coll')
      n.kids = c.kids
        .map(byId)
        .filter(k => k !== undefined)
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
const groupName = (ids: string[]) => {
  const cs = ids.map(byId).filter(c => c !== undefined);
  if (cs[0]?.gn) return cs[0].gn;
  const t = cs
    .filter(c => ['text', 'title', 'note'].includes(c.type))
    .map(c => lyText(plainOf(c)))
    .filter(Boolean)[0];
  return t || (cs.some(c => c.type === 'box' && c.img) ? 'Image spot' : 'Group');
};

export const lyAll = (n: LayerNode): string[] => (n.kind === 'group' ? n.ids : [...n.ids, ...n.kids.flatMap(lyAll)]);

export function renderLayers() {
  const list = $('layers');
  if (!list || !session.board) return;
  if (list.querySelector('[contenteditable="true"]')) return; // never rebuild under someone renaming
  const tree = layerTree();
  $('layerCount').textContent = String(session.board.cards.length || '');
  // open whatever holds the selection, so a picked piece is always visible in the list
  const walk = (ns: LayerNode[], up: string[]): void =>
    ns.forEach(n => {
      if (n.ids.some(i => session.sel.has(i)) && !(n.kind === 'group' && n.ids.every(i => session.sel.has(i))))
        up.forEach(k => {
          LY.open.add(k);
        });
      walk(n.kids, [...up, n.key]);
    });
  walk(tree, []);
  const row = (n: LayerNode, depth: number): string => {
    const c = n.c,
      kids = n.kids.length,
      open = LY.open.has(n.key),
      ids = lyAll(n),
      hidden = ids.length && ids.every(i => byId(i)?.hidden),
      locked = ids.length && ids.every(i => byId(i)?.locked),
      whole = n.kind === 'group' || !c,
      name = esc(whole ? groupName(n.ids) : layerName(c)),
      icon = whole ? (LICON.group ?? '') : layerIcon(c),
      holds = c?.type === 'frame' || c?.type === 'coll' || c?.type === 'section' || n.kind === 'group',
      classes =
        (n.ids.every(i => session.sel.has(i)) ? ' on' : '') +
        (hidden ? ' off' : '') +
        (locked ? ' lk' : '') +
        (holds ? ' parent' : ''),
      key = esc(n.key),
      twisty = (kids ? '' : ' none') + (open ? ' open' : ''),
      twistLabel = open ? 'Close' : 'Open',
      caret = Icon('caret-right'),
      lockTip = locked ? 'Unlock' : 'Lock',
      lockIcon = Icon(locked ? 'lock' : 'unlock'),
      eyeTip = hidden ? 'Show' : 'Hide',
      eyeIcon = Icon(hidden ? 'eye-off' : 'eye'),
      inside = kids && open ? n.kids.map(k => row(k, depth + 1)).join('') : '';
    return `<div class="ly${classes}" data-key="${key}" draggable="true" style="--d:${depth}">
        <button class="ly-tw${twisty}" tabindex="-1" aria-label="${twistLabel}">${caret}</button>
        <span class="ly-ic">${icon}</span><span class="ly-n">${name}</span>
        <button class="ly-b ly-lock" title="${lockTip}">${lockIcon}</button>
        <button class="ly-b ly-eye" title="${eyeTip}">${eyeIcon}</button>
      </div>${inside}`;
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

export const lyFind = (key: string, ns: LayerNode[] = LY.tree): LayerNode | null => {
  for (const n of ns) {
    if (n.key === key) return n;
    const f = lyFind(key, n.kids);
    if (f) return f;
  }
  return null;
};

export const lyHL = (ids: string[], on: boolean) =>
  ids.forEach(i => {
    cardEl(i)?.classList.toggle('ly-hl', on);
  });

// Myra points it out: a soft pink glow pulses around the piece and she pops up on its corner with a wave, then both fade
export function lyFlash(ids: string[]) {
  const cs = ids.map(byId).filter((c): c is Card => !!c && !c.hidden);
  if (!cs.length) return;
  world.querySelectorAll('.ly-flash').forEach(f => {
    f.remove();
  });
  const pad = 10 / session.view.z,
    x0 = Math.min(...cs.map(c => c.x)) - pad,
    y0 = Math.min(...cs.map(c => c.y)) - pad,
    x1 = Math.max(...cs.map(c => c.x + c.w)) + pad,
    y1 = Math.max(...cs.map(c => c.y + c.h)) + pad;
  const f = document.createElement('div');
  f.className = 'ly-flash';
  f.style.setProperty('--iz', (1 / session.view.z).toFixed(4));
  Object.assign(f.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  f.innerHTML =
    '<i class="lf-ring"></i><i class="lf-ring two"></i><img class="lf-myra" src="stamps/myra-wave.png" alt=""><b class="lf-spark">✦</b>';
  world.appendChild(f);
  setTimeout(() => f.classList.add('out'), 1500);
  setTimeout(() => f.remove(), 1900);
}

export function lyBringIntoView(ids: string[]) {
  const cs = ids.map(byId).filter(c => c !== undefined);
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
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 320),
      e = 1 - (1 - k) ** 3;
    session.view.x = fx + (tx - fx) * e;
    session.view.y = fy + (ty - fy) * e;
    applyView();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
export function init13() {
  initLayerIcons();
}
