import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { SHAPE_FILL } from '../cards/shapes.ts';
import { colorLabel } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { cssToHex } from '../ui/color.ts';
import { cardEl, closestTo, htmlIn } from '../ui/dom.ts';
import { syncDesign } from '../wireframe/designPanel.ts';
import { G, caret, closeSbPops, marks, openBarColor, pop, rebuildBar } from './barKit.ts';
import { selCards } from './selected.ts';

const BOX_FILLS = [
  '#ffffff',
  '#f4f4f5',
  '#e4e4e7',
  '#a1a1aa',
  '#27272a',
  '#ffdcd8',
  '#ffe3bd',
  '#e0edd3',
  '#d9e7f3',
  '#ebe1f2',
  '#f1ebe2',
  '#f6b45e',
];
const TEXT_FILLS = ['#27272a', '#ffffff', '#ff5a6e', '#f6b45e', '#f7b955', '#5fc795', '#4f9dff', '#9b7bff'];

// what a fill applies to: boxes without a picture, screens, and closed pen shapes
export const fillable = (c: Card) =>
  (c.type === 'box' && !c.src) || c.type === 'frame' || (c.type === 'path' && !!c.closed);
const isTextFill = (c: Card) => c.type === 'title' || c.type === 'text';

// going to No fill: if it has no border yet, it gets one in the color the fill had, so it never just disappears
function autoBorder(c: Card, was: string | null | undefined) {
  if (c.stroke && (c.sw ?? 0) > 0) return;
  c.stroke = cssToHex(was ?? '') || '#27272a';
  c.sw = ['title', 'text', 'icon'].includes(c.type) ? 1 : 2;
}

const fillOf = (c: Card) =>
  c.type === 'box' ? c.fill || '#e4e4e7' : c.type === 'frame' ? c.fill || '#ffffff' : c.type === 'path' ? c.fill : '';

const dot = (attr: string, v: string, on: boolean) => {
  const cls = on ? 'on' : '';
  return `<button data-${attr}="${v}" title="${v}" style="background:${v}" class="${cls}"></button>`;
};

// box (and screen) fill: wireframe grays, your pastels, and any color
export function boxFillHtml(f: Card) {
  const cur = fillOf(f) || '#ffffff',
    none = cur === 'none',
    noneCls = none ? ' sb-none' : '',
    bg = none ? '' : cur,
    noneOn = none ? 'on' : '',
    dots = BOX_FILLS.map(v => dot('bfill', v, cur.toLowerCase() === v)).join(''),
    CARET = caret();
  return G(
    2,
    pop(
      'fill',
      `<i class="sb-cur${noneCls}" style="background:${bg}"></i>${CARET}`,
      `<div class="sb-dots sb-fills"><button data-bfill="none" title="No fill" class="sb-nofill ${noneOn}"></button>${dots}<button class="sb-anycolor" data-bfwheel="1" title="Any colour"></button></div>`,
      'Fill',
    ),
  );
}

// text color for titles and wireframe text, with No fill (hollow letters)
export function textFillHtml(f: Card) {
  const cur = f.type === 'title' ? f.tc || '' : f.color || '#27272a',
    none = cur === 'none',
    noneCls = none ? ' sb-none' : '',
    c = cur && !none ? cur : 'var(--ink)',
    noneOn = none ? 'on' : '',
    dots = TEXT_FILLS.map(v => dot('tf', v, cur.toLowerCase() === v)).join(''),
    CARET = caret();
  return G(
    2,
    pop(
      'tfill',
      `<i class="sb-cur sb-tcur${noneCls}" style="--c:${c}">A</i>${CARET}`,
      `<div class="sb-dots sb-fills"><button data-tf="none" title="No fill" class="sb-nofill ${noneOn}"></button>${dots}<button class="sb-anycolor" data-tfwheel="1" title="Any colour"></button></div>`,
      'Text colour',
    ),
  );
}

// a shape's colour: the named shape colours, No fill (not for lines), or any colour
export function shapeFillHtml(one: CardOf<'shape'>) {
  const fill = one.fill || 'gray',
    named = !!SHAPE_FILL[fill],
    cur = named ? `var(--sh-${fill})` : fill,
    noneOn = one.fill === 'none' ? 'on' : '',
    noFill = one.shape === 'line' ? '' : `<button data-sf="none" title="No fill" class="sb-nofill ${noneOn}"></button>`,
    dots = Object.keys(SHAPE_FILL)
      .map(n => {
        const label = colorLabel(n),
          cls = fill === n ? 'on' : '';
        return `<button data-sf="${n}" title="${label}" style="background:var(--sh-${n})" class="${cls}"></button>`;
      })
      .join(''),
    anyCls = named ? '' : 'on',
    anyStyle = named ? '' : ` style="--any:${fill}"`,
    anyValue = named ? '#f6b45e' : fill,
    CARET = caret();
  return G(
    2,
    pop(
      'color',
      `<i class="sb-cur" style="background:${cur}"></i>${CARET}`,
      `<div class="sb-dots">${noFill}${dots}<label class="sf-any ${anyCls}" title="Any colour"${anyStyle}><input type="color" data-sfany value="${anyValue}"></label></div>`,
      'Colour',
    ) + `<span class="sb-sep"></span>`,
  );
}

function setTextFill(v: string) {
  const cs = selCards().filter(isTextFill);
  if (!cs.length) return;
  cs.forEach(c => {
    const el = cardEl(c.id)?.querySelector(c.type === 'title' ? '.text' : '.tx'),
      had = c.type === 'title' ? c.tc : c.color;
    if (v === 'none' && had !== 'none') autoBorder(c, had && had !== 'none' ? had : el && getComputedStyle(el).color);
    if (c.type === 'title') {
      if (v === '') delete c.tc;
      else c.tc = v;
    } else c.color = v;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  save();
  const t = htmlIn($('selbar'), '.sb-tcur')[0];
  if (t) {
    t.classList.toggle('sb-none', v === 'none');
    t.style.setProperty('--c', v && v !== 'none' ? v : 'var(--ink)');
  }
  htmlIn($('selbar'), '[data-tf]').forEach(b => b.classList.toggle('on', b.dataset.tf === v));
}

function setFill(v: string, keep?: boolean) {
  const cs = selCards().filter(fillable);
  if (!cs.length) return;
  cs.forEach(c => {
    if (v === 'none' && fillOf(c) !== 'none') autoBorder(c, fillOf(c));
    if (c.type === 'box' || c.type === 'frame' || c.type === 'path') c.fill = v;
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  save();
  const t = htmlIn(document, '[data-pop="fill"] .sb-cur')[0];
  if (t) {
    t.style.background = v === 'none' ? '' : v;
    t.classList.toggle('sb-none', v === 'none');
  }
  htmlIn(document, '[data-bfill]').forEach(b => b.classList.toggle('on', b.dataset.bfill === v));
  if (!keep) {
    rebuildBar();
    closeSbPops();
  }
}

export function initShapeFill() {
  $('selbar').addEventListener('click', e => {
    const v = closestTo(e.target, '[data-sf]')?.dataset.sf,
      cs = selCards(),
      one = cs[0];
    if (v === undefined || one?.type !== 'shape') return;
    if (v === 'none' && one.fill !== 'none' && one.shape !== 'line')
      autoBorder(one, SHAPE_FILL[one.fill || 'gray'] || one.fill);
    one.fill = v;
    cs.forEach(c => renderCard(c));
    selectOnly(cs.map(c => c.id));
    rebuildBar();
    save();
  });

  $('selbar').addEventListener('input', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches('[data-sfany]')) return;
    const one = selCards()[0];
    if (!one || one.type !== 'shape') return;
    one.fill = t.value;
    renderCard(one);
    selectOnly([one.id]);
    closestTo(t, '.sf-any')?.style.setProperty('--any', t.value);
    save();
  });
}

export function initFills() {
  $('selbar').addEventListener(
    'click',
    e => {
      const b = closestTo(e.target, '[data-tf], [data-tfwheel]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      if (b.dataset.tf !== undefined) return setTextFill(b.dataset.tf);
      const cs = selCards().filter(isTextFill),
        first = cs[0],
        was = cs.map(c => ({ tc: c.tc, color: c.color, stroke: c.stroke, sw: c.sw }));
      openBarColor({
        title: 'Text colour',
        hex: cssToHex((first?.type === 'title' ? first.tc : first?.color) ?? '') || '#27272a',
        presets: TEXT_FILLS,
        apply: hex => setTextFill(hex),
        reset: () => {
          cs.forEach((c, i) => {
            Object.assign(c, was[i]);
            renderCard(c);
          });
          save();
        },
      });
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const v = closestTo(e.target, '[data-bfill]')?.dataset.bfill;
      if (v === undefined) return;
      e.stopImmediatePropagation();
      remember();
      setFill(v);
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      if (!closestTo(e.target, '[data-bfwheel]')) return;
      e.stopImmediatePropagation();
      const cs = selCards().filter(fillable),
        first = cs[0];
      if (!first) return;
      remember();
      const was = cs.map(c => (c.type === 'box' || c.type === 'frame' || c.type === 'path' ? c.fill : undefined));
      openBarColor({
        title: 'Fill',
        hex: fillOf(first) || '#ffffff',
        presets: ['#ffffff', '#e4e4e7', '#27272a', '#ffdcd8', '#ffe3bd', '#e0edd3', '#d9e7f3', '#ebe1f2', '#f6b45e'],
        apply: hex => setFill(hex, true),
        reset: () => {
          cs.forEach((c, i) => {
            const v = was[i];
            if (c.type === 'box' || c.type === 'frame' || c.type === 'path') {
              if (v === undefined) delete c.fill;
              else c.fill = v;
            }
            renderCard(c);
          });
          save();
        },
      });
    },
    true,
  );

  $('selbar').addEventListener('input', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches('[data-bfany]')) return;
    if (!marks.fill) {
      remember();
      marks.fill = true;
    }
    setFill(t.value, true);
  });

  $('selbar').addEventListener('change', e => {
    if (e.target instanceof Element && e.target.matches('[data-bfany]')) {
      marks.fill = false;
      rebuildBar();
    }
  });
}
