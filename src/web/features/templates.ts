import type { Template } from '../../shared/ops.ts';
import { clickIn, closestTo, elementById, htmlIn } from '../ui/dom.ts';

type TemplateForm = { name: string; desc: string; mode: string };
const closeTplPick = () => {
  $('tplPick').classList.remove('on');
  $('tools').querySelector('[data-add="tpl"]')?.classList.remove('on');
};

import { typesWith } from '../../shared/cardTypes.ts';
import { fit, placeInView } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, renderWires } from '../canvas/wires.ts';
import { layoutAll } from '../cards/kanban.ts';
import { FRAMEWORKS } from '../content/frameworks.ts';
import { placeFramework, STARTERS, TPL_IC } from '../content/placeFramework.ts';
import { hasAll, queryWords, uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { openBoard } from '../library/openBoard.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { foldersIn } from '../library/tree.ts';
import { newBoard, TEMPLATES } from '../model/boards.ts';
import { say } from '../settings/licenses.ts';
import { stopPlacing } from '../tools/place.ts';
import { esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { scope } from '../ui/toolbar.ts';
import { cardName } from './export.ts';
import { instantiate, templateFrom } from './templateCards.ts';

// ---------- your own templates: save a selection (or the whole board); use it on a board or as a new one (Settings decides) ----------
export let myTpls: Template[] = [];

const NO_KEEP = typesWith('notInTemplates');

export const freeName = (name: unknown, except?: string) => {
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
export async function saveAsTemplate(
  name: string | undefined,
  ids: string[] | null | undefined,
  opts: { desc?: string; mode?: string } = {},
) {
  const cs = ids?.length ? ids.map(byId).filter(c => c !== undefined) : session.board.cards;
  if (!cs.some(c => !NO_KEEP.includes(c.type))) {
    say('There’s nothing here I can keep in a template yet ✦', 3000);
    return null;
  }
  const guess =
    name ||
    (cs.length === session.board.cards.length
      ? session.board.name
      : cs.find(c => c.type === 'title')?.text || (cs.length === 1 ? cardName(cs) : 'My template'));
  const t: Template = Object.assign(templateFrom(cs), {
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
function templateDialog(t: { name?: string; desc?: string; mode?: string }, editing = false) {
  return new Promise<TemplateForm | null>(res => {
    let mode = t.mode === 'new' ? 'new' : 'add';
    const heading = editing ? 'Edit template' : 'Save as a template',
      name = esc(t.name || ''),
      desc = esc(t.desc || ''),
      okLabel = editing ? 'Save' : 'Save template';
    const d = showDialog(`<div class="tdlg" role="dialog"><h3>${heading}</h3>
        <label>Name<input id="tdName" maxlength="60" value="${name}"></label>
        <label>Description<input id="tdDesc" maxlength="140" placeholder="A few words on when to use it" value="${desc}"></label>
        <div class="tdlg-row"><span>When you use it</span><div class="seg" id="tdMode"><button data-v="add">Add to a board</button><button data-v="new">Open a new board</button></div></div>
        <div class="tdlg-btns"><button class="set-btn" id="tdNo">Cancel</button><button class="set-btn hot" id="tdOk">${okLabel}</button></div></div>`);
    const nameIn = elementById('tdName', HTMLInputElement),
      descIn = elementById('tdDesc', HTMLInputElement);
    const paint = () => {
      for (const b of htmlIn(d, '#tdMode [data-v]')) b.classList.toggle('on', b.dataset.v === mode);
    };
    paint();
    const done = (v: TemplateForm | null) => {
      d.remove();
      res(v);
    };
    d.onclick = e => {
      const b = closestTo(e.target, '#tdMode [data-v]');
      if (b) {
        mode = b.dataset.v ?? 'add';
        paint();
      }
      const id = e.target instanceof Element ? e.target.id : '';
      if (e.target === d || id === 'tdNo') done(null);
      if (id === 'tdOk') ok();
    };
    const ok = () =>
      done({
        name: nameIn.value.trim() || t.name || 'My template',
        desc: descIn.value.trim().slice(0, 140),
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
    nameIn.focus();
    nameIn.select();
  });
}

// right-click → ask how it should be kept → save
export async function saveWithDialog(ids: string[] | null) {
  const cs = ids?.length ? ids.map(byId).filter(c => c !== undefined) : session.board.cards;
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

async function deleteTemplate(t: Template) {
  await Fenmyr.removeTemplate(t.id);
  myTpls = myTpls.filter(x => x.id !== t.id);
  buildTplPick();
  say(`Removed “${t.name}” from your templates ✦`, 3000);
}

export async function useTemplate(t: Template, as?: string) {
  const mode = as || t.mode || 'add';
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
  const inst = instantiate(t, 0, 0);
  session.board.cards.push(...inst.cards);
  session.board.links.push(...inst.links);
  inst.cards.forEach(c => {
    renderCard(c, true);
  });
  layoutAll();
  placeInView(inst.cards);
  renderWires();
  save();
  say(`Here’s “${t.name}” ✦ It’s all yours to change.`, 4000);
  return session.board;
}

export async function loadTemplates() {
  myTpls = await Fenmyr.templates().catch(() => []);
  buildTplPick();
}

// grouped by what you're doing; frameworks add to this board, starters open a new one (tagged "New ↗")
const TPL_GROUPS: [heading: string, keys: string[]][] = [
  ['Think', ['empathy', 'journey', 'affinity', 'hmw', 'opportunity', 'matrix']],
  ['Capture', ['Moodboard', 'Brain dump']],
  ['Plan', ['OKRs and opportunities', 'Product kickoff', 'App plan', 'Workshop planning', 'kanban']],
  ['Look back', ['retro']],
];

const tplRow = (k: string) => {
  const F = FRAMEWORKS[k];
  if (F) {
    const icon = Icon(TPL_IC[k] ?? ''),
      name = esc(F.name),
      line = esc(F.line);
    return `<button data-tpl="${k}"><span class="tp-e">${icon}</span><span class="tp-t"><b>${name}</b><small>${line}</small><em class="tp-k">Adds to this board</em></span></button>`;
  }
  const starter = STARTERS[k];
  if (!TEMPLATES[k] || !starter) return '';
  const key = esc(k),
    icon = Icon(starter[1]),
    line = esc(starter[0]);
  return `<button data-starter="${key}"><span class="tp-e">${icon}</span><span class="tp-t"><b>${key}</b><small>${line}</small><em class="tp-k new">Opens a new board ↗</em></span></button>`;
};

const mineRow = (t: Template) => {
  const nw = t.mode === 'new',
    id = esc(t.id),
    icon = Icon('templates'),
    name = esc(t.name),
    desc = esc(t.desc || `${t.cards.length} card${t.cards.length === 1 ? '' : 's'}`),
    kind = nw ? ' new' : '',
    how = nw ? 'Opens a new board ↗' : 'Adds to this board',
    edit = Icon('edit'),
    trash = Icon('trash');
  return `<button data-mine="${id}"><span class="tp-e">${icon}</span><span class="tp-t"><b>${name}</b><small>${desc}</small><em class="tp-k${kind}">${how}</em></span><span class="tp-x"><i data-tm="ren" title="Edit name, description and how it opens">${edit}</i><i data-tm="del" title="Delete">${trash}</i></span></button>`;
};
const searchBox = () => {
  const el = document.getElementById('tpSearch');
  return el instanceof HTMLInputElement ? el : null;
};

// the search sits at the bottom, next to the toolbar button, and has the cursor when the menu opens
export function buildTplPick() {
  const q = searchBox()?.value || '',
    searchIcon = Icon('search', { size: 16 }),
    mine = myTpls.map(mineRow).join('');
  $('tplPick').innerHTML =
    '<div class="tp-list">' +
    TPL_GROUPS.map(([g, keys]) => {
      const rows = keys.map(tplRow).join('');
      return `<div class="tp-h">${g}</div>${rows}`;
    }).join('') +
    (myTpls.length ? `<div class="tp-h">Yours</div>${mine}` : '') +
    '<div class="tp-none" hidden>No templates match</div></div>' +
    `<label class="tp-search">${searchIcon}<input id="tpSearch" placeholder="Search templates…" autocomplete="off" spellcheck="false"></label>`;
  const box = searchBox();
  if (box) box.value = q;
  filterTpl();
}

// every word you type has to appear in a template's name or description; a group's heading hides when none of its templates match
export function filterTpl() {
  const words = queryWords(searchBox()?.value ?? '');
  let head: HTMLElement | null = null,
    headHas = false,
    shown = 0;
  const closeHead = () => {
    if (head) head.hidden = !headHas && words.length > 0;
  };
  htmlIn($('tplPick'), '.tp-list > :not(.tp-none)').forEach(el => {
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
  const none = $('tplPick').querySelector('.tp-none');
  if (none instanceof HTMLElement) none.hidden = shown > 0 || !words.length;
}
export function init42() {
  buildTplPick();

  $('tplPick').addEventListener('input', e => {
    if (e.target instanceof Element && e.target.id === 'tpSearch') filterTpl();
  });

  $('tplPick').addEventListener('keydown', e => {
    if (e.target instanceof Element && e.target.id === 'tpSearch' && e.key === 'Enter') {
      e.preventDefault();
      clickIn($('tplPick'), '.tp-list button:not([hidden])');
    }
  });

  $('tplPick').onclick = async e => {
    const st = closestTo(e.target, '[data-starter]');
    if (st) {
      closeTplPick();
      const name = st.dataset.starter ?? '',
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
    const mine = closestTo(e.target, '[data-mine]');
    if (mine) {
      const t = myTpls.find(x => x.id === mine.dataset.mine),
        tm = closestTo(e.target, '[data-tm]'),
        act = tm?.dataset.tm;
      if (!t) return;
      if (act === 'del') {
        if (!mine.classList.contains('sure')) {
          mine.classList.add('sure');
          tm?.setAttribute('title', 'Click again to delete');
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
      closeTplPick();
      return useTemplate(t);
    }
    const b = closestTo(e.target, '[data-tpl]');
    if (!b) return;
    closeTplPick();
    placeFramework(b.dataset.tpl ?? '');
  };
}
