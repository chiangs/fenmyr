import type { Link } from '../../shared/model.ts';
import { linkById, renderWires, wireColor, wireW } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { settings } from '../settings/settings.ts';
import { closestTo } from '../ui/dom.ts';
import { session } from '../core/state.ts';
import { ICON, caret, closeSbPops, openBarColor, pop } from './barKit.ts';

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

const tb = (a: string, label: string, on: boolean, tip: string) => {
  const cls = on ? 'on' : '';
  return `<button class="sb-txt ${cls}" data-wb="${a}" title="${tip}">${label}</button>`;
};

const wline = (n: number) =>
  `<svg class="sb-wl" width="26" height="14" viewBox="0 0 26 14"><line x1="3" y1="7" x2="23" y2="7" stroke="currentColor" stroke-width="${n}" stroke-linecap="round"/></svg>`;

// what the bar shows depends on all of these; the bar is rebuilt only when this changes
export const wireKey = (lw: Link) => 'w' + lw.id + lw.bend + lw.dash + lw.arrow + !!(lw.pa || lw.pb) + lw.w + lw.color;

// the bar for a selected connector: colour, weight, curved or straight, dashes, arrow, ends
export function wireBarHtml(lw: Link) {
  const cw = wireColor(lw),
    ww = wireW(lw),
    CARET = caret();
  const dots =
    WCOL.map(([n, hex]) => {
      const cls = `${cw === hex ? 'on' : ''}${hex ? '' : ' sb-wdef'}`,
        style = hex ? `background:${hex}` : '';
      return `<button data-wb="col:${hex}" title="${n}" class="${cls}" style="${style}"></button>`;
    }).join('') + `<button data-wb="colcustom" title="Pick another colour…" class="sb-wcustom"></button>`;
  const curCls = cw ? '' : ' sb-wdef',
    curStyle = cw ? `background:${cw}` : '';
  const colorTrig = pop(
    'wcol',
    `<i class="sb-cur${curCls}" style="${curStyle}"></i>${CARET}`,
    `<div class="sb-dots">${dots}</div>`,
    'Line colour',
  );
  const weights = WEIGHTS.map(([n, t]) => {
    const cls = ww === n ? 'on' : '',
      line = wline(n);
    return `<button data-wb="w:${n}" class="${cls}">${line}<span>${t}</span></button>`;
  }).join('');
  const current = wline(ww);
  const weightTrig = pop('wwt', `${current}${CARET}`, `<div class="sb-sizelist">${weights}</div>`, 'Line weight');
  const sep = `<span class="sb-sep"></span>`,
    del = ICON.del ?? '';
  return (
    `<span class="sb-label">Connector</span>` +
    colorTrig +
    weightTrig +
    sep +
    tb('curve', 'Curved', lw.bend !== 0, 'Curved line (drag the middle dot to bend it)') +
    tb('straight', 'Straight', lw.bend === 0, 'Straight line') +
    sep +
    tb('dash', 'Dashed', !!lw.dash, 'Dashed line') +
    tb('arrow', 'Arrow', !!lw.arrow, 'Arrow at the end') +
    tb('flip', 'Flip', false, 'Swap which end has the arrow') +
    (lw.pa || lw.pb ? sep + tb('auto', 'Auto ends', false, 'Let the line choose where it meets each card again') : '') +
    (lw.w || lw.color ? sep + tb('reset', 'Reset', false, 'Back to the default weight and colour') : '') +
    `${sep}<button class="sb-ic" data-wb="del" title="Delete">${del}</button>`
  );
}

const keepSettings = () => {
  try {
    localStorage.setItem('fenmyr:settings', JSON.stringify(settings));
  } catch {}
};

export function initWireBar(place: () => void) {
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
      if (a === 'arrow') l.arrow = !l.arrow;
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
