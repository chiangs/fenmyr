import { typesWith } from '../../shared/cardTypes.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { openCanvas } from '../cards/canvas.ts';
import { endCrop, startCrop } from '../cards/crop.ts';
import { offerFill, spotsIn } from '../cards/imageFill.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { openDoc } from '../docs/editor.ts';
import { startEdit } from '../edit/editing.ts';
import { editTag } from '../edit/text.ts';
import { setDue } from '../features/due.ts';
import { removeSelected } from '../myra/helpers.ts';
import { prototypeThis } from '../repo/start.ts';
import { openColor } from '../ui/colorPicker.ts';
import { closestTo } from '../ui/dom.ts';
import { flipVNote, openVNote } from '../vault/notes.ts';
import { makeSection, renameSection } from '../wireframe/sections.ts';
import { groupSel } from '../wireframe/stack.ts';
import { openTiltPop, removeSection, setTilt } from '../wireframe/tilt.ts';
import { closeSbPops, rebuildBar } from './barKit.ts';
import { selCards } from './selected.ts';

const FILLABLE = typesWith('fillable');

// the due date box in the selection bar: pick a date (and a time if it matters), or one of the quick days
function initDue() {
  const fields = (box: Element | null) => {
      const d = box?.querySelector('[data-due-d]'),
        t = box?.querySelector('[data-due-t]');
      return d instanceof HTMLInputElement && t instanceof HTMLInputElement ? { d, t } : null;
    },
    dueSet = (box: HTMLElement | null) => {
      const c = byId(box?.dataset.for ?? ''),
        f = fields(box);
      if (c && f) setDue(c, f.d.value ? f.d.value + (f.t.value ? `T${f.t.value}` : '') : '');
    };
  $('selbar').addEventListener('change', e => {
    if (closestTo(e.target, '[data-due-d], [data-due-t]')) dueSet(closestTo(e.target, '.sb-due', HTMLElement));
  });
  $('selbar').addEventListener('keydown', e => {
    if (!closestTo(e.target, '[data-due-d], [data-due-t]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') closeSbPops();
  });
  $('selbar').addEventListener('click', e => {
    const b = closestTo(e.target, '[data-due-q], [data-due-clear]');
    if (!b) return;
    e.stopPropagation();
    const box = closestTo(b, '.sb-due', HTMLElement),
      f = fields(box);
    if (!f) return;
    if (b.matches('[data-due-clear]')) f.d.value = f.t.value = '';
    else {
      const d = new Date();
      d.setDate(d.getDate() + +(b.dataset.dueQ ?? 0));
      f.d.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    dueSet(box);
  });
}

// everything else on the bar: card colours, sections, groups, cropping and each card's own buttons
function onBarClick(e: MouseEvent) {
  const cs = selCards(),
    one = cs[0],
    a = closestTo(e.target, '[data-sb]')?.dataset.sb,
    dot = closestTo(e.target, '[data-c]')?.dataset.c,
    cdot = closestTo(e.target, '[data-cc]')?.dataset.cc,
    sc = closestTo(e.target, '[data-sc]')?.dataset.sc,
    cr = closestTo(e.target, '[data-crop]')?.dataset.crop;
  if (a === 'group' || a === 'ungroup') {
    remember();
    return groupSel(a === 'group');
  }
  if (a === 'section') return makeSection(cs);
  if (a === 'prototype') return prototypeThis(cs);
  if (a === 'unsection') return removeSection(cs.filter(c => c.type === 'section'));
  if (!one) return;
  if (a === 'untilt') return setTilt(one, 0, false);
  if (a === 'tiltpop') {
    const b = closestTo(e.target, '[data-sb]');
    if (b) openTiltPop(one, b);
    return;
  }
  if (a === 'rensection') return renameSection(one);
  if (sc && one.type === 'section') {
    remember();
    one.color = sc;
    renderCard(one);
    selectOnly([one.id]);
    rebuildBar();
    save();
    return;
  }
  const redraw = () => {
    cs.forEach(c => {
      renderCard(c);
    });
    selectOnly(cs.map(c => c.id));
    rebuildBar();
    save();
  };
  if (dot) {
    cs.filter(c => FILLABLE.includes(c.type)).forEach(c => {
      c.color = dot;
    });
    redraw();
  }
  if (cdot) {
    one.color = cdot;
    redraw();
  }
  if (a === 'crop' && one.type === 'image') return startCrop(one);
  if (cr === 'cancel' || cr === 'reset' || cr === 'done') return endCrop(cr);
  if (closestTo(e.target, '[data-fill]')) return offerFill(spotsIn(cs));
  if (a === 'open' && one.type === 'doc') openDoc(one);
  if (a === 'open' && one.type === 'canvas') openCanvas(one);
  if (a === 'visit' && (one.type === 'link' || one.type === 'spotify') && one.url) Fenmyr.openURL(one.url);
  if (a === 'vnflip' && one.type === 'vnote') flipVNote(one);
  if (a === 'vnopen' && one.type === 'vnote') openVNote(one);
  if (a === 'relink' && one.type === 'link') {
    one.draft = one.url;
    one.url = '';
    one.image = '';
    one.h = 52;
    redraw();
  }
  if (a === 'head' && one.type === 'coll') {
    one.head = one.head === false;
    redraw();
  }
  if (a === 'count' && one.type === 'coll' && one.head !== false) {
    remember();
    one.count = !one.count;
    redraw();
  }
  if (a === 'hidename' && one.type === 'swatch') {
    one.hideName = !one.hideName;
    redraw();
  }
  if (a === 'hidehex' && one.type === 'swatch') {
    one.hideHex = !one.hideHex;
    redraw();
  }
  if (a === 'pick' && one.type === 'swatch') openColor(one);
  if (a === 'tag') {
    if (one.tagText) {
      delete one.tagText;
      redraw();
    } else editTag(one);
  } // tap again to take the label off
  if (a === 'edit') startEdit(one.id);
  if (a === 'del') removeSelected();
}

export function initActions() {
  initDue();
  $('selbar').onclick = onBarClick;
}
