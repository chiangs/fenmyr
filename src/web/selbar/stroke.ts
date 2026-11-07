import type { Card } from '../../shared/model.ts';
import { canStroke, renderCard, STROKE_TEXT, skStyle } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { closestTo, htmlIn } from '../ui/dom.ts';
import { syncDesign } from '../wireframe/designPanel.ts';
import { caret, closeSbPops, G, markOnce, openBarColor, pct, pop, syncPair } from './barKit.ts';
import { selCards } from './selected.ts';

type Patch = { none?: true; color?: string; w?: number; dash?: string; dl?: number; dg?: number };

const PRESETS = ['#27272a', '#ffffff', '#ff5a6e', '#f6b45e', '#f7b955', '#5fc795', '#4f9dff', '#9b7bff'];
const DASHES: [string, string][] = [
  ['solid', 'Solid'],
  ['dash', 'Dashed'],
  ['dot', 'Dotted'],
  ['none', 'None'],
];

const lineSlider = (k: string, label: string, v: number, max: number) => {
  const p = pct(v, 1, max);
  return `<div class="sbc-top sb-skrow"><span>${label}</span><input type="range" min="1" max="${max}" step="1" value="${v}" style="--p:${p}" data-skr="${k}"><input type="number" min="1" max="${max}" value="${v}" data-skrn="${k}" aria-label="${label}"><b class="sb-unit">px</b></div>`;
};

// solid, dashed or dotted, with the dash length and gap; shapes, boxes and screens only
function dashHtml(f: Card, w: number) {
  const st = skStyle(f),
    chips = DASHES.map(([k, t]) => {
      const cls = (k === 'none' ? !w : w && st === k) ? 'on' : '';
      return `<button data-skd="${k}" class="${cls}"><span class="sks sks-${k}"></span>${t}</button>`;
    }).join(''),
    off = w && st !== 'solid' ? '' : ' off',
    rows = lineSlider('dl', 'Dash', f.dl ?? 8, 40) + lineSlider('dg', 'Gap', f.dg ?? 6, 40);
  return `<div class="sbc-chips sb-skstyles">${chips}</div><div class="sb-skdash${off}" data-skst="${st}">${rows}</div>`;
}

export function strokeHtml(stk: Card[], f: Card) {
  const col = f.stroke || '#27272a',
    w = f.sw || 0,
    max = stk.every(c => STROKE_TEXT.includes(c.type)) ? 12 : 24,
    noDash = stk.some(c => STROKE_TEXT.includes(c.type)); // dashed/dotted is for shapes, boxes and screens
  const SK = [
    '#000000',
    '#ffffff',
    '#71717a',
    '#a1a1aa',
    '#ff5a6e',
    '#f6b45e',
    '#f7b955',
    '#5fc795',
    '#4f9dff',
    '#9b7bff',
    ...(session.board.palette || []).map(p => p.hex),
    ...session.board.cards.flatMap(c => (c.type === 'swatch' && c.hex ? [c.hex] : [])),
  ].slice(0, 18);
  const dots = [...new Set(SK.map(v => v.toLowerCase()))]
      .map(v => {
        const cls = w && col.toLowerCase() === v ? 'on' : '';
        return `<button data-skc="${v}" title="${v}" style="background:${v}" class="${cls}"></button>`;
      })
      .join(''),
    dash = noDash ? '' : dashHtml(f, w),
    p = pct(w, 0, max),
    none = w ? '' : ' none',
    CARET = caret();
  return G(
    2,
    pop(
      'stroke',
      `<i class="sb-cur sb-skcur${none}" style="--c:${col}"></i>${CARET}`,
      `<div class="sb-corners sb-stroke"><div class="sbc-top"><span>Stroke</span><input type="range" min="0" max="${max}" step="0.5" value="${w}" style="--p:${p}" data-skw><input type="number" min="0" max="${max}" step="0.5" value="${w}" data-skn aria-label="Stroke width"><b class="sb-unit">px</b></div>
          <div class="sb-dots sb-fills">${dots}<button class="sb-anycolor" data-skwheel="1" title="Any colour"></button></div>
          ${dash}</div>`,
      'Stroke',
    ),
  );
}

// the open dropdown shows the new stroke without being rebuilt under the pointer
function syncPop(f: Card) {
  const bar = $('selbar'),
    w = f.sw ?? 0,
    on = w > 0,
    cur = htmlIn(bar, '.sb-skcur')[0];
  if (cur) {
    cur.style.setProperty('--c', f.stroke || '#27272a');
    cur.classList.toggle('none', !on);
  }
  htmlIn(bar, '[data-skc]').forEach(b => {
    b.classList.toggle('on', on && (f.stroke || '').toLowerCase() === b.dataset.skc);
  });
  htmlIn(bar, '[data-skd]').forEach(b => {
    b.classList.toggle('on', b.dataset.skd === 'none' ? !on : on && b.dataset.skd === skStyle(f));
  });
  const dash = htmlIn(bar, '.sb-skdash')[0];
  if (dash) {
    dash.classList.toggle('off', !on || skStyle(f) === 'solid');
    dash.dataset.skst = skStyle(f);
  }
  const rg = bar.querySelector('[data-skw]'),
    nb = bar.querySelector('[data-skn]');
  if (rg instanceof HTMLInputElement && nb instanceof HTMLInputElement && document.activeElement !== nb) {
    rg.value = nb.value = String(w);
    rg.style.setProperty('--p', pct(w, 0, +rg.max));
  }
}

function setStroke(patch: Patch) {
  const cs = selCards().filter(c => canStroke(c));
  const f = cs[0];
  if (!f) return;
  cs.forEach(c => {
    if (patch.none) {
      delete c.stroke;
      delete c.sw;
      delete c.sdash;
    } else {
      if (patch.color) c.stroke = patch.color;
      if (patch.w !== undefined) c.sw = patch.w;
      if (patch.dash === 'solid') delete c.sdash;
      else if (patch.dash !== undefined) c.sdash = patch.dash;
      if (patch.dl !== undefined) c.dl = patch.dl;
      if (patch.dg !== undefined) c.dg = patch.dg;
      if (!c.stroke) c.stroke = '#27272a';
      if (!((c.sw ?? 0) > 0) && (patch.color || patch.dash !== undefined))
        c.sw = STROKE_TEXT.includes(c.type) ? 1.5 : 2;
    }
    renderCard(c);
  });
  selectOnly(cs.map(c => c.id));
  syncDesign();
  renderWires();
  save();
  syncPop(f);
}

export function initStroke(place: () => void) {
  $('selbar').addEventListener('input', e => {
    const p = syncPair(e.target, 'data-skw', 'data-skn');
    if (!p) return;
    markOnce('sk');
    setStroke({ w: Math.max(0, +p.r.value) });
  });

  $('selbar').addEventListener('input', e => {
    const p = syncPair(e.target, 'data-skr', 'data-skrn');
    if (!p) return;
    markOnce('sk');
    const v = Math.max(1, +p.r.value);
    if (p.key === 'dl') setStroke({ dl: v });
    if (p.key === 'dg') setStroke({ dg: v });
  });

  $('selbar').addEventListener('keydown', e => {
    if (!closestTo(e.target, '[data-skrn], [data-skn]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      closeSbPops();
      place();
    }
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const color = closestTo(e.target, '[data-skc]')?.dataset.skc,
        dash = closestTo(e.target, '[data-skd]')?.dataset.skd,
        wheel = closestTo(e.target, '[data-skwheel]');
      if (!color && !dash && !wheel) return;
      e.stopImmediatePropagation();
      if (color || dash) markOnce('sk'); // one undo per visit to the dropdown
      if (color) return setStroke({ color });
      if (dash) return setStroke(dash === 'none' ? { none: true } : { dash });
      const cs = selCards().filter(k => canStroke(k));
      remember();
      const was = cs.map(k => ({ stroke: k.stroke, sw: k.sw, sdash: k.sdash }));
      openBarColor({
        title: 'Stroke',
        hex: cs[0]?.stroke || '#27272a',
        presets: PRESETS,
        apply: hex => setStroke({ color: hex }),
        reset: () => {
          cs.forEach((k, i) => {
            Object.assign(k, was[i]);
            renderCard(k);
          });
          save();
        },
      });
    },
    true,
  );
}
