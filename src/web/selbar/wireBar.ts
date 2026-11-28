import type { Link } from '../../shared/model.ts';
import { type Arrow, arrowOf, isArrow, setArrow } from '../../shared/wireArrow.ts';
import { renderWires, wireColor, wireW } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { linkById, session } from '../core/state.ts';
import { keepSettings, settings } from '../settings/settings.ts';
import { closestTo } from '../ui/dom.ts';
import { caret, closeSbPops, colourTrig, G, ICON, moreHtml, openBarColor, pop } from './barKit.ts';
import { group } from './group.ts';

const WCOL = [
  ['Default (follows the theme)', ''],
  ['Ink', '#3b342d'],
  ['Snow', '#ffffff'],
  ['Lingonberry', '#dc4b3e'],
  ['Cloudberry', '#f0b04a'],
  ['Moss', '#6fae5a'],
  ['Fjord', '#4f8fc9'],
  ['Heather', '#a98ad6'],
  ['Birch', '#c9b49a'],
];

const WEIGHTS: [number, string][] = [
  [2, 'Regular'],
  [4, 'Medium'],
  [6, 'Bold'],
];

const ARROW_NAMES: [Arrow, string][] = [
  ['none', 'No arrow'],
  ['end', 'Arrow at the end'],
  ['both', 'Arrows at both ends'],
];

const tb = (a: string, label: string, on: boolean, tip: string, disabled = false) => {
  const cls = on ? 'on' : '',
    off = disabled ? ' disabled' : '';
  return `<button class="sb-txt ${cls}" data-wb="${a}" title="${tip}"${off}>${label}</button>`;
};

const wline = (n: number) =>
  `<svg class="sb-wl" width="26" height="14" viewBox="0 0 26 14"><line x1="3" y1="7" x2="23" y2="7" stroke="currentColor" stroke-width="${n}" stroke-linecap="round"/></svg>`;

// a line with the arrowheads a wire has, drawn like wline
const aline = (a: Arrow) => {
  const tail = a === 'both' ? '<polyline points="9 3 3 7 9 11"/>' : '',
    head = a === 'none' ? '' : '<polyline points="17 3 23 7 17 11"/>';
  return `<svg class="sb-wl" width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="7" x2="23" y2="7"/>${tail}${head}</svg>`;
};

// what the bar shows depends on all of these; the bar is rebuilt only when this changes
export const wireKey = (lw: Link) =>
  `w${lw.id}${lw.bend}${lw.dash}${arrowOf(lw)}${!!(lw.pa || lw.pb)}${lw.w}${lw.color}`;

// the bar for a selected connector: colour, weight, curved or straight, dashes, arrowheads, ends
function wireBarHtml(lw: Link) {
  const cw = wireColor(lw),
    ww = wireW(lw),
    CARET = caret();
  const colours = WCOL.map(([n, hex]) => {
      const cls = (cw === hex ? 'on' : '') + (hex ? '' : ' sb-wdef'),
        style = hex ? `background:${hex}` : '';
      return `<button data-wb="col:${hex}" title="${n}" class="${cls}" style="${style}"></button>`;
    }).join(''),
    dots = `${colours}<button data-wb="colcustom" title="Pick another colour…" class="sb-wcustom"></button>`;
  const curCls = cw ? '' : ' sb-wdef',
    curStyle = cw ? `background:${cw}` : '',
    trig = colourTrig('pen', `<i class="sb-cur${curCls}" style="${curStyle}"></i>`);
  const colorTrig = pop('wcol', trig, `<div class="sb-dots">${dots}</div>`, 'Line colour');
  const weights = WEIGHTS.map(([n, t]) => {
    const cls = ww === n ? 'on' : '',
      line = wline(n);
    return `<button data-wb="w:${n}" class="${cls}">${line}<span>${t}</span></button>`;
  }).join('');
  const current = wline(ww);
  const weightTrig = pop('wwt', `${current}${CARET}`, `<div class="sb-sizelist">${weights}</div>`, 'Line weight');
  const heads = arrowOf(lw),
    arrows = ARROW_NAMES.map(([a, t]) => {
      const cls = heads === a ? 'on' : '',
        line = aline(a);
      return `<button data-wb="arrow:${a}" class="${cls}">${line}<span>${t}</span></button>`;
    }).join(''),
    shown = aline(heads),
    arrowTrig = pop('warr', `${shown}${CARET}`, `<div class="sb-sizelist">${arrows}</div>`, 'Arrowheads');
  // Flip swaps which end has the arrow, so with none or both there is nothing it could change
  const flips = heads === 'end',
    flipTip = flips ? 'Swap which end has the arrow' : 'Flip needs an arrow at one end only';
  const sep = `<span class="sb-sep"></span>`,
    del = ICON.del ?? '';
  return (
    G(0, colorTrig + weightTrig) +
    G(
      1,
      sep +
        tb('curve', 'Curved', lw.bend !== 0, 'Curved line (drag the middle dot to bend it)') +
        tb('straight', 'Straight', lw.bend === 0, 'Straight line'),
    ) +
    G(
      2,
      sep + tb('dash', 'Dashed', !!lw.dash, 'Dashed line') + arrowTrig + tb('flip', 'Flip', false, flipTip, !flips),
    ) +
    (lw.pa || lw.pb
      ? G(3, sep + tb('auto', 'Auto ends', false, 'Let the line choose where it meets each card again'))
      : '') +
    (lw.w || lw.color ? G(3, sep + tb('reset', 'Reset', false, 'Back to the default weight and colour')) : '') +
    moreHtml() +
    `${sep}<button class="sb-ic" data-wb="del" title="Delete">${del}</button>`
  );
}

function initWireBar(place: () => void) {
  $('selbar').addEventListener(
    'click',
    e => {
      const a = closestTo(e.target, '[data-wb]')?.dataset.wb,
        l = session.selWire ? linkById(session.selWire) : undefined;
      if (!a || !l) return;
      e.stopImmediatePropagation();
      if (a === 'curve' && l.bend === 0) delete l.bend;
      if (a === 'straight') l.bend = 0;
      // the next connector you draw starts like this one
      const keepStyle = () => {
        const style = { ...(l.w ? { w: l.w } : {}), ...(l.color ? { color: l.color } : {}) };
        if (Object.keys(style).length) settings.wireStyle = style;
        else delete settings.wireStyle;
        keepSettings();
      };
      if (a.startsWith('col:')) {
        const hex = a.slice(4);
        if (hex) l.color = hex;
        else delete l.color;
        keepStyle();
        closeSbPops();
      }
      if (a.startsWith('w:')) {
        const n = +a.slice(2);
        if (n === 4 || n === 6) l.w = n;
        else delete l.w;
        keepStyle();
        closeSbPops();
      }
      if (a === 'reset') {
        delete l.w;
        delete l.color;
        delete settings.wireStyle;
        keepSettings();
      }
      if (a === 'colcustom') {
        openBarColor({
          title: 'Line colour',
          hex: wireColor(l) || '#6b6259',
          presets: ['#3b342d', '#ffffff', '#dc4b3e', '#f0b04a', '#6fae5a', '#4f8fc9', '#a98ad6', '#c9b49a'],
          apply: hex => {
            l.color = hex;
            keepStyle();
            renderWires();
            save();
          },
          reset: () => {
            delete l.color;
            keepStyle();
            renderWires();
            save();
          },
        });
        return;
      }
      if (a === 'dash') l.dash = !l.dash;
      if (a.startsWith('arrow:')) {
        const heads = a.slice(6);
        if (isArrow(heads)) setArrow(l, heads);
        closeSbPops();
      }
      if (a === 'flip') {
        [l.a, l.b] = [l.b, l.a];
        const { pa, pb } = l;
        if (pb) l.pa = pb;
        else delete l.pa;
        if (pa) l.pb = pa;
        else delete l.pb;
        if (l.bend) l.bend = -l.bend;
      }
      if (a === 'auto') {
        delete l.pa;
        delete l.pb;
      }
      if (a === 'del') {
        session.board.links = session.board.links.filter(x => x !== l);
        session.selWire = null;
      }
      $('selbar').dataset.key = '';
      renderWires();
      save();
      place();
    },
    true,
  );
}

export const wire = group({
  on: ctx => (ctx.kind === 'connector' ? ctx.link : null),
  html: wireBarHtml,
  init: initWireBar,
});
