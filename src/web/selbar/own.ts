import { typesWith } from '../../shared/cardTypes.ts';
import { byId } from '../canvas/wires.ts';
import { openCanvas } from '../cards/canvas.ts';
import { endCrop, startCrop } from '../cards/crop.ts';
import { offerFill, spotsIn } from '../cards/imageFill.ts';
import { $ } from '../core/dom.ts';
import { openDoc } from '../docs/editor.ts';
import { editTag } from '../edit/text.ts';
import { hasDue, setDue } from '../features/due.ts';
import { tagEditor } from '../features/tags.ts';
import { openColor } from '../ui/colorPicker.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { flipVNote, openVNote } from '../vault/notes.ts';
import { btn, caret, closeSbPops, G, ICON, pop, redraw } from './barKit.ts';
import { group, onBar, one, only } from './group.ts';

const NO_LABEL = typesWith('noLabel');

export const swatch = group({
  on: ctx => only(ctx, 'swatch'),
  html: one =>
    G(
      2,
      btn('pick', 'color', 'Change the colour') +
        btn('hidename', 'name', one.hideName ? 'Show the name' : 'Hide the name', !one.hideName) +
        btn('hidehex', 'hex', one.hideHex ? 'Show the hex' : 'Hide the hex', !one.hideHex),
    ),
  init: () =>
    onBar('sb', (a, cs) => {
      const [one] = cs;
      if (one.type !== 'swatch') return;
      if (a === 'hidename') {
        one.hideName = !one.hideName;
        redraw(cs);
      }
      if (a === 'hidehex') {
        one.hideHex = !one.hideHex;
        redraw(cs);
      }
      if (a === 'pick') openColor(one);
    }),
});

// a box with an image spot stands in for a picture until one fills it
export const imageSpot = group({
  on: ctx => {
    const box = only(ctx, 'box');
    return box?.img && !box.src ? box : null;
  },
  html: () => `<button class="sb-txt" data-fill="1" title="Fill this image spot">Fill image ✦</button>`,
  init: () => onBar('fill', (_, cs) => offerFill(spotsIn(cs))),
});

// a picture's caption is its label, so the label's handler adds and removes it
export const picture = group({
  on: ctx => only(ctx, 'image'),
  html: one =>
    G(
      2,
      btn('crop', 'crop', 'Crop') +
        btn('tag', 'caption', one.tagText ? 'Remove the caption' : 'Add a caption', !!one.tagText),
    ),
  init: () =>
    onBar('sb', (a, [one]) => {
      if (a === 'crop' && one.type === 'image') startCrop(one);
    }),
});

export const tag = group({
  on: ctx => {
    const c = one(ctx);
    return c && !NO_LABEL.includes(c.type) ? c : null;
  },
  html: one => G(6, btn('tag', 'tag', one.tagText ? 'Remove the label' : 'Add a label', !!one.tagText)),
  init: () =>
    onBar('sb', (a, cs) => {
      const [one] = cs;
      if (a !== 'tag') return;
      if (one.tagText) {
        delete one.tagText;
        redraw(cs);
      } else editTag(one);
    }),
});

export const tags = group({
  on: ctx => only(ctx, 'note'),
  html: one => {
    const n = (one.tags || []).length,
      count = n ? `<b>${n}</b>` : '',
      icon = ICON.tags ?? '',
      editor = tagEditor(one),
      CARET = caret();
    return G(
      2,
      pop('tags', `${icon}${count}${CARET}`, `<div class="sb-tags" data-for="${one.id}">${editor}</div>`, 'Tags'),
    );
  },
});

// pick a date (and a time if it matters), or one of the quick days
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

export const due = group({
  on: ctx => {
    const c = one(ctx);
    return c && hasDue(c) ? c : null;
  },
  html: one => {
    const cal = Icon('calendar'),
      set = one.due ? '<b>•</b>' : '',
      day = esc((one.due || '').slice(0, 10)),
      time = esc((one.due || '').slice(11)),
      CARET = caret();
    return G(
      2,
      pop(
        'due',
        `${cal}${set}${CARET}`,
        `<div class="sb-due" data-for="${one.id}"><div class="sd-row"><label><span>Date</span><input type="date" data-due-d value="${day}"></label><label><span>Time</span><input type="time" data-due-t value="${time}"></label></div><div class="sd-chips"><button data-due-q="0">Today</button><button data-due-q="1">Tomorrow</button><button data-due-q="7">Next week</button><button data-due-clear>Clear</button></div></div>`,
        'Due date',
      ),
    );
  },
  init: initDue,
});

export const doc = group({
  on: ctx => only(ctx, 'doc'),
  html: () => btn('open', 'open', 'Open the doc'),
  init: () =>
    onBar('sb', (a, [one]) => {
      if (a === 'open' && one.type === 'doc') openDoc(one);
    }),
});

export const vnote = group({
  on: ctx => only(ctx, 'vnote'),
  html: () => btn('vnflip', 'flip', 'Flip the card') + btn('vnopen', 'open', 'Open in Obsidian'),
  init: () =>
    onBar('sb', (a, [one]) => {
      if (a === 'vnflip' && one.type === 'vnote') flipVNote(one);
      if (a === 'vnopen' && one.type === 'vnote') openVNote(one);
    }),
});

export const canvas = group({
  on: ctx => only(ctx, 'canvas'),
  html: () => btn('open', 'open', 'Open this canvas'),
  init: () =>
    onBar('sb', (a, [one]) => {
      if (a === 'open' && one.type === 'canvas') openCanvas(one);
    }),
});

// a new address takes the card back to the box you type one into
export const link = group({
  on: ctx => {
    const c = only(ctx, 'link');
    return c?.url ? c : null;
  },
  html: () => G(2, btn('visit', 'open', 'Open the link') + btn('relink', 'link', 'Change the link')),
  init: () =>
    onBar('sb', (a, cs) => {
      const [one] = cs;
      if (one.type !== 'link') return;
      if (a === 'visit' && one.url) Fenmyr.openURL(one.url);
      if (a === 'relink') {
        one.draft = one.url;
        one.url = '';
        one.image = '';
        one.h = 52;
        redraw(cs);
      }
    }),
});

export const spotify = group({
  on: ctx => only(ctx, 'spotify'),
  html: () => btn('visit', 'open', 'Open in Spotify'),
  init: () =>
    onBar('sb', (a, [one]) => {
      if (a === 'visit' && one.type === 'spotify' && one.url) Fenmyr.openURL(one.url);
    }),
});

const CROP_BAR = `<button class="sb-txt" data-crop="cancel">Cancel</button><button class="sb-txt" data-crop="reset">Reset</button><button class="sb-txt on" data-crop="done">Done</button>`;

export const crop = group({
  on: ctx => (ctx.kind === 'selection' && ctx.crop ? ctx.cards : null),
  html: () => CROP_BAR,
  init: () =>
    onBar('crop', how => {
      if (how === 'cancel' || how === 'reset' || how === 'done') endCrop(how);
    }),
});
