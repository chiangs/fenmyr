import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { cardEl, closestTo, htmlIn } from '../ui/dom.ts';
import { caret, closeSbPops, G, markOnce, pct, pop, syncPair } from './barKit.ts';
import { group, one } from './group.ts';
import { selCards } from './selected.ts';

type Line = CardOf<'shape'>;
const isLine = (c: Card): c is Line => c.type === 'shape' && c.shape === 'line';
type Patch = { squig?: string; height?: number; waves?: number; round?: number; wobble?: number; lw?: number };

const STYLES: [string, string][] = [
  ['straight', 'Straight'],
  ['wavy', 'Wavy'],
  ['zigzag', 'Zigzag'],
  ['loopy', 'Loopy'],
];
const PATH: Record<string, string> = {
  straight: 'M3 12h18',
  wavy: 'M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2',
  zigzag: 'M2 15l4-6 4 6 4-6 4 6 4-6',
  loopy: 'M2 15c3 0 4-8 2-8s-1 8 3 8 4-8 2-8-1 8 3 8 4-8 2-8-1 8 4 8',
};
// each style starts at its own look (wavy = round, zigzag = sharp); the slider takes it from there
const START_ROUND: Record<string, number> = { wavy: 100, zigzag: 0, loopy: 60 };

const slider = (k: string, label: string, v: number, min: number, max: number, unit = '') => {
  const p = pct(v, min, max);
  return `<div class="sbc-top sb-sqrow" data-sqk="${k}"><span>${label}</span><input type="range" min="${min}" max="${max}" step="1" value="${v}" style="--p:${p}" data-sq="${k}"><input type="number" min="${min}" max="${max}" value="${v}" data-sqn="${k}" aria-label="${label}"><b class="sb-unit">${unit}</b></div>`;
};

function lineStyleHtml(one: Line) {
  const st = one.squig || 'straight',
    icon = PATH[st] ?? '',
    chips = STYLES.map(([k, t]) => {
      const cls = st === k ? 'on' : '',
        d = PATH[k] ?? '';
      return `<button data-sqs="${k}" class="${cls}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg>${t}</button>`;
    }).join(''),
    more =
      slider('waves', 'Tightness', one.waves ?? 6, 1, 30) +
      slider('round', st === 'loopy' ? 'Loop size' : 'Roundness', one.round ?? 60, 0, 100, '%') +
      slider('height', 'Height', Math.round(one.h), 8, 300, 'px') +
      slider('wobble', 'Wobble', one.wobble ?? 0, 0, 100, '%'),
    width = slider('lw', 'Thickness', one.lw ?? 4, 1, 24, 'px'),
    CARET = caret();
  return G(
    2,
    pop(
      'squig',
      `<svg viewBox="0 0 24 24" class="sb-l24"><path d="${icon}"/></svg>${CARET}`,
      `<div class="sb-corners sb-squig" data-st="${st}"><div class="sbc-chips sb-sqstyles">${chips}</div>
          <div class="sb-sqmore">${more}</div>
          ${width}</div>`,
      'Line style',
    ),
  );
}

// the open dropdown follows a change of style without being rebuilt under the pointer
function syncPop(c: Line) {
  const pop = $('selbar').querySelector('.sb-squig');
  if (!(pop instanceof HTMLElement)) return;
  const st = c.squig || 'straight';
  pop.dataset.st = st;
  htmlIn(pop, '[data-sqs]').forEach(b => {
    b.classList.toggle('on', b.dataset.sqs === st);
  });
  const lab = pop.querySelector('[data-sqk="round"] span');
  if (lab) lab.textContent = c.squig === 'loopy' ? 'Loop size' : 'Roundness';
  const now: [string, number][] = [
    ['height', Math.round(c.h)],
    ['round', c.round ?? 60],
  ];
  for (const [k, v] of now) {
    const row = pop.querySelector(`[data-sqk="${k}"]`),
      rg = row?.querySelector('[data-sq]');
    if (!row || !(rg instanceof HTMLInputElement)) continue;
    row.querySelectorAll('input').forEach(i => {
      i.value = String(v);
    });
    rg.style.setProperty('--p', pct(v, +rg.min, +rg.max));
  }
  const trig = $('selbar').querySelector('[data-pop="squig"] path'),
    d = PATH[st];
  if (trig && d) trig.setAttribute('d', d);
}

function setSquig(patch: Patch) {
  const c = selCards().find(isLine);
  if (!c) return;
  if (patch.squig) {
    if (patch.squig === 'straight') delete c.squig;
    else c.squig = patch.squig;
    c.round = START_ROUND[patch.squig] ?? c.round;
    if (c.squig && c.h < 40) {
      c.y -= (60 - c.h) / 2;
      c.h = 60;
    }
    if (!c.squig && c.h > 24) {
      c.y += (c.h - 24) / 2;
      c.h = 24;
    }
  }
  if (patch.height !== undefined) {
    const nh = Math.max(8, patch.height);
    c.y -= (nh - c.h) / 2;
    c.h = nh;
  }
  if (patch.waves !== undefined) c.waves = patch.waves;
  if (patch.round !== undefined) c.round = patch.round;
  if (patch.wobble !== undefined) c.wobble = patch.wobble;
  if (patch.lw !== undefined) c.lw = patch.lw;
  renderCard(c);
  const el = cardEl(c.id);
  if (el) Object.assign(el.style, { top: `${c.y}px`, height: `${c.h}px` });
  selectOnly([c.id]);
  renderWires();
  save();
  if (patch.squig) syncPop(c);
}

function initLineStyle(place: () => void) {
  $('selbar').addEventListener(
    'click',
    e => {
      const squig = closestTo(e.target, '[data-sqs]')?.dataset.sqs;
      if (!squig) return;
      e.stopImmediatePropagation();
      markOnce('sq');
      setSquig({ squig });
    },
    true,
  );

  $('selbar').addEventListener('input', e => {
    const p = syncPair(e.target, 'data-sq', 'data-sqn');
    if (!p) return;
    markOnce('sq');
    const v = Math.max(+p.rg.min, Math.min(+p.rg.max, +p.r.value));
    if (p.key === 'height' || p.key === 'waves' || p.key === 'round' || p.key === 'wobble' || p.key === 'lw')
      setSquig({ [p.key]: v });
  });

  $('selbar').addEventListener('keydown', e => {
    if (!closestTo(e.target, '[data-sqn]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      closeSbPops();
      place();
    }
  });
}

export const lineStyle = group({
  on: ctx => {
    const c = one(ctx);
    return c && isLine(c) ? c : null;
  },
  html: lineStyleHtml,
  init: initLineStyle,
});
