import { renderAll, renderCard } from '../canvas/render.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { layoutAll } from '../cards/kanban.ts';
import { $, cardsEl, stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { endEdit } from '../edit/editing.ts';
import { chirp } from '../settings/licenses.ts';
import { closestTo } from '../ui/dom.ts';
import { renderPalette } from '../ui/palette.ts';
import { layerName } from './layerNames.ts';
import { type LayerNode, LY, lyAll, lyBringIntoView, lyFind, lyFlash, lyHL, renderLayers } from './layers.ts';

export function wireLayers() {
  const list = $('layers');
  if (!list || list.dataset.wired) return;
  list.dataset.wired = '1';
  list.addEventListener('pointerover', e => {
    const r = closestTo(e.target, '.ly', HTMLElement);
    cardsEl.querySelectorAll('.ly-hl').forEach(el => {
      el.classList.remove('ly-hl');
    });
    if (r) {
      const n = lyFind(r.dataset.key ?? '');
      n && lyHL(lyAll(n), true);
    }
  });
  list.addEventListener('pointerleave', () =>
    cardsEl.querySelectorAll('.ly-hl').forEach(el => {
      el.classList.remove('ly-hl');
    }),
  );
  // right-click a layer: the same menu as right-clicking that thing on the board (it gets selected first, if it isn't already)
  list.addEventListener('contextmenu', e => {
    const r = closestTo(e.target, '.ly', HTMLElement);
    if (!r) return;
    const n = lyFind(r.dataset.key ?? '');
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
    const r = closestTo(e.target, '.ly', HTMLElement);
    if (!r) return;
    const n = lyFind(r.dataset.key ?? '');
    if (!n) return;
    if (closestTo(e.target, '.ly-tw')) {
      if (LY.open.has(n.key)) LY.open.delete(n.key);
      else LY.open.add(n.key);
      return renderLayers();
    }
    if (closestTo(e.target, '.ly-eye')) {
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
    if (closestTo(e.target, '.ly-lock')) {
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
      n.ids.forEach(i => {
        all ? session.sel.delete(i) : session.sel.add(i);
      });
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
  function lyRename(key: string) {
    const r = list.querySelector(`.ly[data-key="${CSS.escape(key)}"]`),
      nm = r?.querySelector('.ly-n');
    if (!(r instanceof HTMLElement) || !(nm instanceof HTMLElement)) return;
    const n = lyFind(key);
    if (!n) return;
    LY.html = '';
    nm.contentEditable = 'true';
    nm.focus();
    getSelection()?.selectAllChildren(nm);
    r.draggable = false;
    const done = (ok: boolean) => {
      nm.contentEditable = 'false';
      r.draggable = true;
      const v = (nm.textContent ?? '').trim();
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
          if (!c) return;
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
              const p = session.board.palette?.find(x => x.hex === c.hex);
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
    const r = closestTo(e.target, '.ly', HTMLElement);
    if (r && !closestTo(e.target, '.ly-b, .ly-tw')) setTimeout(() => lyRename(r.dataset.key ?? ''), 0);
  });
  // drag rows to restack (or, inside a collection, to reorder its cards). Only between neighbors that share the same parent
  list.addEventListener('dragstart', e => {
    const r = closestTo(e.target, '.ly', HTMLElement);
    if (!r) return;
    LY.drag = r.dataset.key ?? null;
    r.classList.add('dragging');
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', '');
    } catch (_er) {}
  });
  const parentKey = (key: string) => {
    const find = (ns: LayerNode[], p: string): string | undefined => {
      for (const n of ns) {
        if (n.key === key) return p;
        const f = find(n.kids, n.key);
        if (f !== undefined) return f;
      }
      return undefined;
    };
    return find(LY.tree, '');
  };
  list.addEventListener('dragover', e => {
    const r = closestTo(e.target, '.ly', HTMLElement);
    list.querySelectorAll('.drop-a, .drop-b').forEach(x => {
      x.classList.remove('drop-a', 'drop-b');
    });
    if (!r || !LY.drag || r.dataset.key === LY.drag || parentKey(r.dataset.key ?? '') !== parentKey(LY.drag)) return;
    e.preventDefault();
    const b = r.getBoundingClientRect();
    r.classList.add(e.clientY < b.top + b.height / 2 ? 'drop-a' : 'drop-b');
  });
  list.addEventListener('dragend', () => {
    LY.drag = null;
    list.querySelectorAll('.dragging, .drop-a, .drop-b').forEach(x => {
      x.classList.remove('dragging', 'drop-a', 'drop-b');
    });
  });
  list.addEventListener('drop', e => {
    const r = closestTo(e.target, '.drop-a, .drop-b', HTMLElement);
    if (!r || !LY.drag) return;
    e.preventDefault();
    const above = r.classList.contains('drop-a');
    const mv = lyFind(LY.drag),
      tg = lyFind(r.dataset.key ?? '');
    if (!mv || !tg) return;
    remember();
    const co = mv.inColl ? byId(mv.inColl) : undefined;
    if (co?.type === 'coll' && mv.c && tg.c) {
      const moved = mv.c.id,
        k = co.kids.filter(i => i !== moved),
        at = k.indexOf(tg.c.id);
      k.splice(above ? at : at + 1, 0, moved);
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
