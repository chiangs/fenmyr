import type { Template } from '../../shared/ops.ts';
import { clickIn, closestTo, elementById, htmlIn } from '../ui/dom.ts';

type TemplateForm = { name: string; desc: string; mode: string };
const closeTplPick = () => {
  $('tplPick').classList.remove('on');
  $('tools').querySelector('[data-add="tpl"]')?.classList.remove('on');
};

import { typesWith } from '../../shared/cardTypes.ts';
import { placeInView } from '../canvas/handles.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires } from '../canvas/wires.ts';
import { layoutAll } from '../cards/kanban.ts';
import { STARTERS, TPL_IC } from '../content/placeFramework.ts';
import { queryWords, uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { byId, session } from '../core/state.ts';
import { createWithCards, type Place } from '../library/create.ts';
import { newBoard } from '../model/boards.ts';
import { say } from '../myra/say.ts';
import { stopPlacing } from '../tools/place.ts';
import { esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { cardName } from './export.ts';
import { instantiate, templateFrom } from './templateCards.ts';
import { matchesSearch, runTemplate, type TemplateEntry, tagOf, templateEntries } from './templateList.ts';

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

// `at` only matters for a new board: adding to the open board has no place to choose
export async function useTemplate(t: Template, as?: string, at?: Place) {
  const mode = as || t.mode || 'add';
  if (mode === 'new') {
    await createWithCards(Object.assign(newBoard(t.name), instantiate(t, 0, 0)), at);
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

const iconOf = (e: TemplateEntry) => {
  switch (e.kind) {
    case 'prototype':
      return 'code';
    case 'framework':
      return TPL_IC[e.key] ?? '';
    case 'starter':
      return STARTERS[e.key]?.[1] ?? '';
    case 'mine':
      return 'templates';
    default: {
      const unhandled: never = e.kind;
      return unhandled;
    }
  }
};

const tplRow = (e: TemplateEntry) => {
  const icon = Icon(iconOf(e)),
    name = esc(e.name),
    line = esc(e.line),
    key = esc(e.key),
    tag = tagOf(e),
    kind = e.opens === 'new' ? ' new' : '',
    data =
      e.kind === 'prototype'
        ? 'data-prototype="1"'
        : e.kind === 'starter'
          ? `data-starter="${key}"`
          : `data-tpl="${key}"`;
  return `<button ${data}><span class="tp-e">${icon}</span><span class="tp-t"><b>${name}</b><small>${line}</small><em class="tp-k${kind}">${tag}</em></span></button>`;
};

const mineRow = (e: TemplateEntry) => {
  const id = esc(e.key),
    icon = Icon(iconOf(e)),
    name = esc(e.name),
    desc = esc(e.line),
    kind = e.opens === 'new' ? ' new' : '',
    how = tagOf(e),
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
    rows = templateEntries()
      .map((e, i, all) => {
        const head = e.group === all[i - 1]?.group ? '' : `<div class="tp-h">${e.group}</div>`;
        return head + (e.kind === 'mine' ? mineRow(e) : tplRow(e));
      })
      .join('');
  $('tplPick').innerHTML =
    `<div class="tp-list">${rows}<div class="tp-none" hidden>No templates match</div></div>` +
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
    const ok = matchesSearch(
      words,
      el.querySelector('.tp-t b')?.textContent || '',
      el.querySelector('.tp-t small')?.textContent || '',
    );
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

  const run = async (kind: TemplateEntry['kind'], key: string | undefined) => {
    const entry = templateEntries().find(x => x.kind === kind && x.key === key);
    closeTplPick();
    if (entry) await runTemplate(entry);
  };

  $('tplPick').onclick = async e => {
    if (closestTo(e.target, '[data-prototype]')) return run('prototype', 'prototype');
    const st = closestTo(e.target, '[data-starter]');
    if (st) return run('starter', st.dataset.starter);
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
      return run('mine', t.id);
    }
    const b = closestTo(e.target, '[data-tpl]');
    if (b) return run('framework', b.dataset.tpl);
  };
}
