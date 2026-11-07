import { typesWith } from '../../shared/cardTypes.ts';
import { COLL } from '../cards/collection.ts';
import { COLOR_NAMES, COLORS, colorLabel } from '../core/base.ts';
import { remember } from '../core/history.ts';
import { btn, caret, G, pop, redraw, SEP } from './barKit.ts';
import { group, onBar, only, some } from './group.ts';

const FILLABLE = typesWith('fillable');

// in dark mode a Snow card is drawn dark, so its chip shows what you will get
const chipBg = (n: string | undefined) =>
  n === 'white' && document.body.classList.contains('dark') ? '#38332d' : COLORS[n ?? ''];

export const colorPop = (cur: string, dots: string) => {
  const CARET = caret();
  return pop(
    'color',
    `<i class="sb-cur" style="background:${cur}"></i>${CARET}`,
    `<div class="sb-dots">${dots}</div>`,
    'Colour',
  );
};

export const colorDot = (attr: string, n: string, bg: string, on: boolean) => {
  const label = colorLabel(n),
    cls = on ? 'on' : '';
  return `<button data-${attr}="${n}" title="${label}" style="background:${bg}" class="${cls}"></button>`;
};

export const collColours = group({
  on: ctx => only(ctx, 'coll'),
  html: one => {
    const dots = Object.keys(COLL)
        .map(n => colorDot('cc', n, COLL[n]?.[0] ?? '#fff', one.color === n))
        .join(''),
      head = one.head === false ? 'Show the header' : 'Hide the header',
      noHeader = one.head === false,
      count = noHeader
        ? 'Show the header to count its cards'
        : one.count
          ? 'Hide the count'
          : 'Show a count of the cards';
    return (
      G(2, colorPop(COLL[one.color ?? '']?.[0] || '#fff', dots) + SEP) +
      btn('head', 'head', head, one.head !== false) +
      btn('count', 'count', count, !!one.count && !noHeader, noHeader)
    );
  },
  init: () => {
    onBar('cc', (cc, cs) => {
      cs[0].color = cc;
      redraw(cs);
    });
    onBar('sb', (a, cs) => {
      const [one] = cs;
      if (a === 'head' && one.type === 'coll') {
        one.head = one.head === false;
        redraw(cs);
      }
      if (a === 'count' && one.type === 'coll' && one.head !== false) {
        remember();
        one.count = !one.count;
        redraw(cs);
      }
    });
  },
});

export const noteColours = group({
  on: some(c => FILLABLE.includes(c.type)),
  html: fill => {
    const [first] = fill,
      cur = fill.every(c => c.color === first.color)
        ? chipBg(first.color) || '#fff'
        : 'conic-gradient(#ffdcd8 0 25%, #ffe3bd 0 50%, #e0edd3 0 75%, #d9e7f3 0)',
      dots = COLOR_NAMES.map(n =>
        colorDot(
          'c',
          n,
          chipBg(n) ?? '',
          fill.every(c => c.color === n),
        ),
      ).join('');
    return G(2, colorPop(cur, dots) + SEP);
  },
  init: () =>
    onBar('c', (dot, cs) => {
      cs.filter(c => FILLABLE.includes(c.type)).forEach(c => {
        c.color = dot;
      });
      redraw(cs);
    }),
});
