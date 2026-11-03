import type { Card, CardOf } from '../../shared/model.ts';
import { esc } from '../ui/dom.ts';
import { DEVICES, FONTS } from './wireframes.ts';
import { ALIGN } from './designPanel.ts';

const KIND: Record<string, string> = { frame: 'Screen', box: 'Box', text: 'Text', font: 'Font' };

export const field = (k: string, label: string, v: string | number, type = 'number', extra = '') => {
  const value = esc(v),
    step = type === 'number' ? ' step="1"' : '';
  return `<label class="dz-f ${extra}"><span>${label}</span><input data-k="${k}" type="${type}" value="${value}"${step}></label>`;
};

// the font picker's choices, the card's own first, with the one in use selected
const fontOptions = (cur: string, selected: string | undefined) =>
  [...new Set([cur, ...FONTS])]
    .map(f => {
      const sel = selected === f ? ' selected' : '',
        name = esc(f);
      return `<option${sel} style="font-family:'${name}'">${name}</option>`;
    })
    .join('');

export function fontCardSection(fc: Card) {
  const options = fontOptions(fc.font || 'Figtree', fc.font);
  return `<div class="dz-sec"><div class="label">Font</div><div class="dz-grid"><label class="dz-f wide"><span>Font</span><select data-k="font">${options}</select></label><label class="dz-f wide"><span>Or any Google font</span><input data-k="gfont" placeholder="e.g. Playfair Display" spellcheck="false"></label></div><div class="dz-hint">Double-click the sample line on the card to try your own words.</div></div>`;
}

export function placeSection(one: Card) {
  const label = KIND[one.type] ?? '',
    fields =
      field('x', 'X', Math.round(one.x)) +
      field('y', 'Y', Math.round(one.y)) +
      field('w', 'W', Math.round(one.w)) +
      (one.type === 'text' ? '' : field('h', 'H', Math.round(one.h)));
  return `<div class="dz-sec"><div class="label">${label}</div><div class="dz-grid">${fields}</div></div>`;
}

export const sec = (body: string) => `<div class="dz-sec"><div class="dz-grid">${body}</div></div>`;
const BTN_FONT = 'font:600 11.5px/1 var(--font)';

export function iconSection(one: Card) {
  const fields = field('isz', 'Size', Math.round(one.w)) + field('color', 'Colour', one.color || '#27272a', 'color'),
    icon = Icon(one.type === 'icon' ? (one.name ?? 'star') : 'star', { size: 16 });
  return `<div class="dz-sec"><div class="label">Icon</div><div class="dz-grid">${fields}</div><div class="dz-row"><button data-swap="1" style="${BTN_FONT};gap:6px;display:flex;align-items:center;justify-content:center">${icon} Change icon</button></div></div>`;
}

export function groupSection(grouped: boolean) {
  const act = grouped ? 'off' : 'on',
    label = grouped ? 'Ungroup  ⇧⌘G' : 'Group  ⌘G';
  return `<div class="dz-sec"><div class="dz-row"><button data-grp="${act}" style="${BTN_FONT}">${label}</button></div></div>`;
}

export function frameSection(one: CardOf<'frame'>) {
  const cur = one.device || 'Custom',
    devices = ['Custom', ...Object.keys(DEVICES)]
      .map(n => {
        const sel = cur === n ? ' selected' : '';
        return `<option${sel}>${n}</option>`;
      })
      .join(''),
    name = field('name', 'Name', one.name || 'Screen', 'text', 'wide'),
    rest = field('fill', 'Fill', one.fill || '#ffffff', 'color') + field('radius', 'Corners', one.radius ?? 0);
  return sec(
    `${name}<label class="dz-f wide"><span>Device</span><select data-k="device">${devices}</select></label>${rest}`,
  );
}

export function boxSection(one: CardOf<'box'>) {
  const fields =
    field('fill', 'Fill', one.fill || '#e4e4e7', 'color') +
    field('radius', 'Corners', one.radius || 0) +
    field('stroke', 'Border', one.stroke || '#a1a1aa', 'color') +
    field('sw', 'Width', one.sw || 0) +
    field('opacity', 'Opacity %', Math.round((one.opacity ?? 1) * 100), 'number', 'wide');
  return `<div class="dz-sec"><div class="label">Look</div><div class="dz-grid">${fields}</div></div>`;
}

const WEIGHTS: [number, string][] = [
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Semi'],
  [700, 'Bold'],
  [800, 'Extra'],
];

export function textSection(one: CardOf<'text'>) {
  const cur = one.font || 'Figtree',
    fonts = fontOptions(cur, cur),
    size = field('size', 'Size', one.size || 18),
    weights = WEIGHTS.map(([v, n]) => {
      const sel = (one.weight || 500) === v ? ' selected' : '';
      return `<option value="${v}"${sel}>${n}</option>`;
    }).join(''),
    look = field('color', 'Colour', one.color || '#27272a', 'color') + field('lh', 'Line', one.lh || 1.3),
    aligns = ['left', 'center', 'right']
      .map(a => {
        const on = (one.align || 'left') === a ? 'on' : '',
          tip = a === 'center' ? 'centre' : a,
          icon = ALIGN[a[0] ?? 'l'];
        return `<button data-talign="${a}" class="${on}" title="Align ${tip}">${icon}</button>`;
      })
      .join('');
  return `<div class="dz-sec"><div class="label">Type</div><div class="dz-grid"><label class="dz-f wide"><span>Font</span><select data-k="font">${fonts}</select></label>
      ${size}<label class="dz-f"><span>Weight</span><select data-k="weight">${weights}</select></label>
      ${look}</div><div class="dz-row">${aligns}</div></div>`;
}

export function alignSection(n: number) {
  const label = n > 1 ? 'Align' : 'Align on its screen',
    buttons = ['l', 'c', 'r', 't', 'm', 'b']
      .map(a => {
        const icon = ALIGN[a] ?? '';
        return `<button data-align="${a}" title="Align">${icon}</button>`;
      })
      .join(''),
    across = ALIGN.dh ?? '',
    down = ALIGN.dv ?? '',
    spread =
      n > 2
        ? `<div class="dz-row"><button data-dist="h" title="Even spacing across">${across}</button><button data-dist="v" title="Even spacing down">${down}</button></div>`
        : '';
  return `<div class="dz-sec"><div class="label">${label}</div><div class="dz-row">${buttons}</div>${spread}</div>`;
}
