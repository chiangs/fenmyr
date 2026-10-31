// @ts-nocheck
import { typesWith } from '../../shared/cardTypes.ts';
import { fit } from '../canvas/handles.ts';
import { esc, renderCard } from '../canvas/render.ts';
import { byId, renderWires } from '../canvas/wires.ts';
import { layoutAll } from '../cards/kanban.ts';
import { FRAMEWORKS, STARTERS, TPL_IC, placeFramework } from '../content/frameworks.ts';
import { hasAll, queryWords, uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { cardName } from './export.ts';
import { openBoard } from '../library/home.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { foldersIn } from '../library/tree.ts';
import { TEMPLATES, newBoard } from '../model/boards.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { say } from '../settings/licenses.ts';
import { stopPlacing } from '../tools/place.ts';
import { scope } from '../ui/toolbar.ts';
import { onFrame } from '../wireframe/tilt.ts';
import { session } from '../core/state.ts';

// ---------- your own templates: save a selection (or the whole board); use it on a board or as a new one (Settings decides) ----------
export let myTpls = [];

const NO_KEEP = typesWith('notInTemplates');
// files and other boards stay out of templates; pictures become empty image spots
function templateFrom(cs) {
  const all = new Set(cs);
  cs.forEach(c => {
    if (c.type === 'coll') (c.kids || []).forEach(k => byId(k) && all.add(byId(k)));
    if (c.type === 'frame') onFrame(c).forEach(k => all.add(k));
  });
  const kept = [...all].filter(c => !NO_KEEP.includes(c.type)),
    ids = new Set(kept.map(c => c.id));
  const x0 = Math.min(...kept.map(c => c.x)),
    y0 = Math.min(...kept.map(c => c.y));
  const cards = kept.map(c => {
    const o = JSON.parse(JSON.stringify(c));
    o.x = Math.round(o.x - x0);
    o.y = Math.round(o.y - y0);
    if (o.type === 'image') {
      o.type = 'box';
      o.img = o.caption || 'Image';
      ['src', 'crop', 'cropEdit', 'caption'].forEach(k => delete o[k]);
    }
    if (o.type === 'link') {
      delete o.image;
    }
    if (o.kids) o.kids = o.kids.filter(k => ids.has(k));
    if (o.colOf) o.colOf = Object.fromEntries(Object.entries(o.colOf).filter(([k]) => ids.has(k)));
    return o;
  });
  const links = session.board.links.filter(l => ids.has(l.a) && ids.has(l.b)).map(l => JSON.parse(JSON.stringify(l)));
  return { cards, links };
}

// fresh ids for everything, so a template can be used again and again
function instantiate(t, dx, dy) {
  const ids = {},
    grp = {};
  t.cards.forEach(c => (ids[c.id] = uid()));
  const cards = t.cards.map(c => {
    const o = JSON.parse(JSON.stringify(c));
    o.id = ids[c.id];
    o.x += dx;
    o.y += dy;
    if (o.kids) o.kids = o.kids.map(k => ids[k]).filter(Boolean);
    if (o.colOf)
      o.colOf = Object.fromEntries(
        Object.entries(o.colOf)
          .filter(([k]) => ids[k])
          .map(([k, v]) => [ids[k], v]),
      );
    if (o.group) o.group = grp[o.group] || (grp[o.group] = uid());
    return o;
  });
  return {
    cards,
    links: (t.links || []).filter(l => ids[l.a] && ids[l.b]).map(l => ({ ...l, id: uid(), a: ids[l.a], b: ids[l.b] })),
  };
}

export const freeName = (name, except) => {
  let n =
      String(name || 'My template')
        .trim()
        .slice(0, 60) || 'My template',
    k = 2;
  const base = n;
  while (myTpls.some(t => t.id !== except && t.name.toLowerCase() === n.toLowerCase())) n = `${base} ${k++}`;
  return n;
};

// ids = the cards to keep (none: the whole board)
export async function saveAsTemplate(name, ids, opts = {}) {
  const cs = ids && ids.length ? ids.map(byId).filter(Boolean) : session.board.cards;
  if (!cs.some(c => !NO_KEEP.includes(c.type))) {
    say('There’s nothing here I can keep in a template yet ✦', 3000);
    return null;
  }
  const guess =
    name ||
    (cs.length === session.board.cards.length
      ? session.board.name
      : cs.find(c => c.type === 'title')?.text || (cs.length === 1 ? cardName(cs) : 'My template'));
  const t = Object.assign(templateFrom(cs), {
    id: uid(),
    name: freeName(guess),
    desc: String(opts.desc || '')
      .trim()
      .slice(0, 140),
    mode: opts.mode === 'new' ? 'new' : 'add',
    made: Date.now(),
  });
  await Fenmyr.saveTemplate(t);
  myTpls.push(t);
  buildTplPick();
  return t;
}

// the little form for a template's name, description and how it opens (when you save it, and again whenever you edit it)
function templateDialog(t, editing) {
  return new Promise(res => {
    const d = document.createElement('div');
    d.className = 'tdlg-wrap';
    let mode = t.mode === 'new' ? 'new' : 'add';
    d.innerHTML = `<div class="tdlg" role="dialog"><h3>${editing ? 'Edit template' : 'Save as a template'}</h3>
        <label>Name<input id="tdName" maxlength="60" value="${esc(t.name || '')}"></label>
        <label>Description<input id="tdDesc" maxlength="140" placeholder="A few words on when to use it" value="${esc(t.desc || '')}"></label>
        <div class="tdlg-row"><span>When you use it</span><div class="seg" id="tdMode"><button data-v="add">Add to a board</button><button data-v="new">Open a new board</button></div></div>
        <div class="tdlg-btns"><button class="set-btn" id="tdNo">Cancel</button><button class="set-btn hot" id="tdOk">${editing ? 'Save' : 'Save template'}</button></div></div>`;
    document.body.appendChild(d);
    const paint = () =>
      d.querySelectorAll('#tdMode [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
    paint();
    const done = v => {
      d.remove();
      res(v);
    };
    d.onclick = e => {
      const b = e.target.closest('#tdMode [data-v]');
      if (b) {
        mode = b.dataset.v;
        paint();
      }
      if (e.target === d || e.target.id === 'tdNo') done(null);
      if (e.target.id === 'tdOk') ok();
    };
    const ok = () =>
      done({
        name: d.querySelector('#tdName').value.trim() || t.name || 'My template',
        desc: d.querySelector('#tdDesc').value.trim().slice(0, 140),
        mode,
      });
    d.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        ok();
      }
      if (e.key === 'Escape') done(null);
    };
    const n = d.querySelector('#tdName');
    n.focus();
    n.select();
  });
}

// right-click → ask how it should be kept → save
export async function saveWithDialog(ids) {
  const cs = ids && ids.length ? ids.map(byId).filter(Boolean) : session.board.cards;
  if (!cs.some(c => !NO_KEEP.includes(c.type))) {
    say('There’s nothing here I can keep in a template yet ✦', 3000);
    return;
  }
  const whole = cs.length === session.board.cards.length,
    d = await templateDialog({
      name: whole
        ? session.board.name
        : cs.find(c => c.type === 'title')?.text || (cs.length === 1 ? cardName(cs) : ''),
      mode: whole ? 'new' : 'add',
    });
  if (!d) return;
  const t = await saveAsTemplate(d.name, ids, d);
  if (t) say(`Saved “${t.name}”. You’ll find it under Yours in the template picker ✦`, 5000);
}

async function deleteTemplate(t) {
  await Fenmyr.removeTemplate(t.id);
  myTpls = myTpls.filter(x => x.id !== t.id);
  buildTplPick();
  say(`Removed “${t.name}” from your templates ✦`, 3000);
}

export async function useTemplate(t, mode) {
  mode = mode || t.mode || 'add';
  if (mode === 'new') {
    const b = newBoard(t.name),
      { f, p } = scope(),
      into = f || (p && foldersIn(p.id)[0]);
    if (into) b.folder = into.id;
    Object.assign(b, instantiate(t, 0, 0));
    await Fenmyr.save(b);
    await openBoard(b.id);
    fit(session.board.cards);
    refreshBoards();
    return session.board;
  }
  remember();
  stopPlacing();
  const c0 = centerWorld(),
    x0 = session.board.cards.length ? Math.max(...session.board.cards.map(c => c.x + c.w)) + 200 : c0.x - 300,
    y0 = session.board.cards.length ? Math.min(...session.board.cards.map(c => c.y)) : c0.y - 200;
  const inst = instantiate(t, x0, y0);
  session.board.cards.push(...inst.cards);
  session.board.links.push(...inst.links);
  inst.cards.forEach(c => renderCard(c, true));
  layoutAll();
  renderWires();
  save();
  fit(inst.cards);
  say(`Here’s “${t.name}” ✦ It’s all yours to change.`, 4000);
  return session.board;
}

export async function loadTemplates() {
  myTpls = await Fenmyr.templates().catch(() => []);
  buildTplPick();
}

// grouped by what you're doing; frameworks add to this board, starters open a new one (tagged "New ↗")
const TPL_GROUPS = [
  ['Think', ['empathy', 'journey', 'affinity', 'hmw', 'opportunity', 'matrix']],
  ['Capture', ['Moodboard', 'Brain dump']],
  ['Plan', ['OKRs and opportunities', 'Product kickoff', 'App plan', 'kanban']],
  ['Look back', ['retro']],
];

const tplRow = k => {
  const F = FRAMEWORKS[k];
  if (F)
    return `<button data-tpl="${k}"><span class="tp-e">${Icon(TPL_IC[k])}</span><span class="tp-t"><b>${esc(F.name)}</b><small>${esc(F.line)}</small><em class="tp-k">Adds to this board</em></span></button>`;
  const [line, ic] = STARTERS[k] || [];
  if (!TEMPLATES[k] || !line) return '';
  return `<button data-starter="${esc(k)}"><span class="tp-e">${Icon(ic)}</span><span class="tp-t"><b>${esc(k)}</b><small>${esc(line)}</small><em class="tp-k new">Opens a new board ↗</em></span></button>`;
};

const mineRow = t => {
  const nw = t.mode === 'new';
  return `<button data-mine="${esc(t.id)}"><span class="tp-e">${Icon('templates')}</span><span class="tp-t"><b>${esc(t.name)}</b><small>${esc(t.desc || `${t.cards.length} card${t.cards.length === 1 ? '' : 's'}`)}</small><em class="tp-k${nw ? ' new' : ''}">${nw ? 'Opens a new board ↗' : 'Adds to this board'}</em></span><span class="tp-x"><i data-tm="ren" title="Edit name, description and how it opens">${Icon('edit')}</i><i data-tm="del" title="Delete">${Icon('trash')}</i></span></button>`;
};

// the search sits at the bottom, next to the toolbar button, and has the cursor when the menu opens
export function buildTplPick() {
  const q = $('tpSearch')?.value || '';
  $('tplPick').innerHTML =
    '<div class="tp-list">' +
    TPL_GROUPS.map(([g, keys]) => `<div class="tp-h">${g}</div>` + keys.map(tplRow).join('')).join('') +
    (myTpls.length ? '<div class="tp-h">Yours</div>' + myTpls.map(mineRow).join('') : '') +
    '<div class="tp-none" hidden>No templates match</div></div>' +
    `<label class="tp-search">${Icon('search', { size: 16 })}<input id="tpSearch" placeholder="Search templates…" autocomplete="off" spellcheck="false"></label>`;
  $('tpSearch').value = q;
  filterTpl();
}

// every word you type has to appear in a template's name or description; a group's heading hides when none of its templates match
export function filterTpl() {
  const words = queryWords($('tpSearch')?.value);
  let head = null,
    headHas = false,
    shown = 0;
  const closeHead = () => {
    if (head) head.hidden = !headHas && words.length > 0;
  };
  $('tplPick')
    .querySelectorAll('.tp-list > :not(.tp-none)')
    .forEach(el => {
      if (el.classList.contains('tp-h')) {
        closeHead();
        head = el;
        headHas = false;
        return;
      }
      const txt = (
          (el.querySelector('.tp-t b')?.textContent || '') +
          ' ' +
          (el.querySelector('.tp-t small')?.textContent || '')
        ).toLowerCase(),
        ok = hasAll(words, txt);
      el.hidden = !ok;
      if (ok) {
        headHas = true;
        shown++;
      }
    });
  closeHead();
  $('tplPick').querySelector('.tp-none').hidden = shown > 0 || !words.length;
}
export function init42() {
  buildTplPick();

  $('tplPick').addEventListener('input', e => {
    if (e.target.id === 'tpSearch') filterTpl();
  });

  $('tplPick').addEventListener('keydown', e => {
    if (e.target.id === 'tpSearch' && e.key === 'Enter') {
      e.preventDefault();
      $('tplPick').querySelector('.tp-list button:not([hidden])')?.click();
    }
  });

  $('tplPick').onclick = async e => {
    const st = e.target.closest('[data-starter]');
    if (st) {
      $('tplPick').classList.remove('on');
      $('tools').querySelector('[data-add="tpl"]').classList.remove('on');
      const name = st.dataset.starter,
        b = newBoard(name, name),
        { f, p } = scope(),
        into = f || (p && foldersIn(p.id)[0]);
      if (into) b.folder = into.id;
      await Fenmyr.save(b);
      await openBoard(b.id);
      fit(session.board.cards);
      refreshBoards();
      return;
    }
    const mine = e.target.closest('[data-mine]');
    if (mine) {
      const t = myTpls.find(x => x.id === mine.dataset.mine),
        act = e.target.closest('[data-tm]')?.dataset.tm;
      if (!t) return;
      if (act === 'del') {
        if (!mine.classList.contains('sure')) {
          mine.classList.add('sure');
          e.target.closest('[data-tm]').title = 'Click again to delete';
          setTimeout(() => mine.classList.remove('sure'), 3000);
          return;
        }
        return deleteTemplate(t);
      }
      if (act === 'ren') {
        const d = await templateDialog(t, true);
        if (d) {
          Object.assign(t, d);
          t.name = freeName(d.name, t.id);
          await Fenmyr.saveTemplate(t);
          buildTplPick();
        }
        return;
      }
      $('tplPick').classList.remove('on');
      $('tools').querySelector('[data-add="tpl"]').classList.remove('on');
      return useTemplate(t);
    }
    const b = e.target.closest('[data-tpl]');
    if (!b) return;
    $('tplPick').classList.remove('on');
    $('tools').querySelector('[data-add="tpl"]').classList.remove('on');
    placeFramework(b.dataset.tpl);
  };
}
