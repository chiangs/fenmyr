import type { Card, CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { colorName } from '../cards/colorNames.ts';
import { clamp } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { chirp } from '../myra/say.ts';
import { hexOf, type Rgb, rgbOf } from './color.ts';
import { type ColourFormat, FORMATS, readColour, writeColour } from './colourFormat.ts';
import { cardEl, closestTo, elementById, esc } from './dom.ts';
import { renderPalette, tintPicker } from './palette.ts';
import { closeOnOutsidePress } from './popover.ts';
import { boardColorRows, palette } from './wheelColors.ts';

// a colour in the app itself (the background, the accent, a doc's text) rather than a colour card
export type Tint = {
  tint: true;
  title: string;
  hex: string;
  presets: string[];
  at: { x: number; y: number };
  apply: (hex: string) => void;
  reset: () => void;
  boardColors?: boolean;
  fromBar?: boolean;
  // set to offer HSL, RGB and hex, and to hear which one the person picks
  format?: { value: ColourFormat; pick: (f: ColourFormat) => void };
};
type Swatch = CardOf<'swatch'>;
const hexField = () => elementById('cpHex', HTMLInputElement);
let fmt: ColourFormat = 'hex';
const showHex = (hex: string) => {
  hexField().value = fmt === 'hex' ? hex.toUpperCase() : writeColour(hex, fmt);
  for (const b of $('cpFmt').querySelectorAll<HTMLElement>('[data-fmt]'))
    b.classList.toggle('on', b.dataset.fmt === fmt);
};
const nameField = () => elementById('cpName', HTMLInputElement);

// ---------- colors: the editor beside a color card, and the board's own palette ----------
// the wheel works in HSV: hue = angle, saturation = distance from the middle, value = the brightness slider
let colorCard: Swatch | Tint | null = null;
let hsv = { h: 330, s: 0.4, v: 1 };

const hsv2rgb = (h: number, s: number, v: number): Rgb => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)];
};

const hex2hsv = (hex: string) => {
  const [r255, g255, b255] = rgbOf(hex),
    r = r255 / 255,
    g = g255 / 255,
    b = b255 / 255,
    mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
};
let wheelCv: HTMLCanvasElement;
let wg: CanvasRenderingContext2D;

function drawWheel() {
  const N = wheelCv.width,
    R = N / 2,
    img = wg.createImageData(N, N),
    d = img.data;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - R + 0.5,
        dy = y - R + 0.5,
        r = Math.hypot(dx, dy),
        i = (y * N + x) * 4;
      if (r > R) continue;
      const [cr, cg, cb] = hsv2rgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, Math.min(1, r / R), hsv.v);
      d[i] = cr;
      d[i + 1] = cg;
      d[i + 2] = cb;
      d[i + 3] = r > R - 1 ? Math.round((R - r) * 255) : 255;
    }
  wg.putImageData(img, 0, 0);
}

function showHSV() {
  const W = 220,
    a = (hsv.h * Math.PI) / 180,
    rr = (hsv.s * W) / 2;
  Object.assign($('wheelRing').style, {
    left: `${W / 2 + Math.cos(a) * rr}px`,
    top: `${W / 2 + Math.sin(a) * rr}px`,
    background: hexOf(hsv2rgb(hsv.h, hsv.s, hsv.v)),
  });
  $('bright').style.background = `linear-gradient(to right, #000, ${hexOf(hsv2rgb(hsv.h, hsv.s, 1))})`;
  Object.assign($('brightRing').style, { left: `${hsv.v * 100}%`, background: hexOf(hsv2rgb(hsv.h, hsv.s, hsv.v)) });
}

function dragOn(el: HTMLElement, fn: (e: PointerEvent) => void) {
  el.addEventListener('pointerdown', e => {
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    fn(e);
    const mv = (ev: PointerEvent) => fn(ev),
      up = () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        save();
      };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
  });
}

let drawnV = -1;
function drawIfV() {
  if (Math.abs(drawnV - hsv.v) > 0.004) {
    drawnV = hsv.v;
    drawWheel();
  }
  showHSV();
}

function placeColorPop(c: Card) {
  const el = cardEl(c.id);
  if (!el) return;
  const r = el.getBoundingClientRect(),
    s = stage.getBoundingClientRect(),
    pop = $('cpop'),
    floor = Math.min(s.bottom, $('dock').getBoundingClientRect().top - 14), // never over the bottom bar
    ph = pop.offsetHeight || 470;
  let x = r.right + 14;
  if (x + 270 > s.right - 250) x = r.left - 270;
  pop.style.left = `${Math.max(s.left + 260, x)}px`;
  pop.style.top = `${clamp(r.top, s.top + 70, Math.max(s.top + 70, floor - ph))}px`;
}

// the wheel's colors: two easy rows, or every color on the board (remembered while the app is open)
let cpAll = false;

export function openColor(c: Swatch | Tint) {
  const tint = 'tint' in c ? c : null;
  fmt = tint?.format?.value ?? 'hex';
  $('cpop').classList.toggle('fmt', !!tint?.format);
  $('cpop').classList.toggle('tint', !!tint);
  $('cpop').classList.toggle('from-bar', !!tint?.fromBar);
  if ('tint' in c) {
    // a UI color, not a color card: no name or palette, a few starting points, and a way back to the default
    colorCard = c;
    hsv = hex2hsv(c.hex);
    drawIfV();
    showHex(c.hex);
    $('cpDot').style.background = c.hex;
    $('cpTitle').textContent = c.title;
    $('cpQuick').innerHTML = c.boardColors
      ? boardColorRows(c.presets, cpAll)
      : c.presets
          .map(h => {
            const name = h.toUpperCase();
            return `<button style="background:${h}" data-hex="${h}" title="${name}"></button>`;
          })
          .join('');
    $('cpQuick').classList.toggle('rows', !!c.boardColors);
    $('cpReset').hidden = !!c.boardColors;
    $('cpQuick').dataset.starter = c.boardColors ? JSON.stringify(c.presets) : '';
    const pop = $('cpop');
    pop.classList.add('on');
    const w = 252,
      h = pop.offsetHeight || 470;
    pop.style.left = `${clamp(c.at.x, 12, innerWidth - w - 12)}px`;
    pop.style.top = `${clamp(c.at.y, 12, innerHeight - h - 12)}px`;
    return;
  }
  colorCard = c;
  hsv = hex2hsv(c.hex);
  drawIfV();
  showHex(c.hex);
  nameField().value = c.label || '';
  $('cpDot').style.background = c.hex;
  $('cpQuick').innerHTML = palette()
    .map(p => {
      const name = esc(p.name);
      return `<button style="background:${p.hex}" data-hex="${p.hex}" title="${name}"></button>`;
    })
    .join('');
  $('cpSave').textContent = palette().some(p => p.hex === c.hex) ? 'Update board colour' : 'Save to board colours';
  $('cpSave').classList.remove('saved-ok');
  placeColorPop(c);
  $('cpop').classList.add('on');
}

export function closeColor() {
  $('cpop').classList.remove('on');
  colorCard = null;
}

function setColor(hex: string | null | undefined, from: string) {
  if (colorCard && 'tint' in colorCard && hex) {
    colorCard.hex = hex;
    $('cpDot').style.background = hex;
    if (from !== 'hex') showHex(hex);
    if (from !== 'wheel') {
      hsv = hex2hsv(hex);
      drawIfV();
    }
    colorCard.apply(hex);
    return;
  }
  if (!colorCard || 'tint' in colorCard || !hex) return;
  colorCard.hex = hex;
  $('cpDot').style.background = hex;
  if (from !== 'hex') showHex(hex);
  if (from !== 'wheel') {
    hsv = hex2hsv(hex);
    drawIfV();
  }
  const named = palette().find(p => p.hex === hex);
  if (named && from !== 'name') {
    colorCard.label = named.name ?? '';
    nameField().value = colorCard.label;
  } else if (colorCard.autoName !== false && from !== 'name') {
    colorCard.label = colorName(hex);
    colorCard.autoName = true;
    nameField().value = colorCard.label;
  }
  $('cpSave').textContent = named ? 'Update board colour' : 'Save to board colours';
  $('cpSave').classList.remove('saved-ok');
  renderCard(colorCard);
  selectOnly([colorCard.id]);
  if (from !== 'wheel') save();
}

const keepCpopOnScreen = () => {
  const p = $('cpop'),
    r = p.getBoundingClientRect();
  if (r.bottom > innerHeight - 12) p.style.top = `${Math.max(12, innerHeight - r.height - 12)}px`;
};

export const boardBg = () => (typeof session.board.bg === 'string' ? session.board.bg : '');

export function init57() {
  wheelCv = elementById('wheelCv', HTMLCanvasElement);
  const g = wheelCv.getContext('2d');
  if (!g) throw new Error('no 2D canvas for the colour wheel');
  wg = g;

  dragOn($('wheel'), e => {
    const r = $('wheel').getBoundingClientRect(),
      dx = e.clientX - r.left - r.width / 2,
      dy = e.clientY - r.top - r.height / 2;
    hsv.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    hsv.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    if (hsv.v < 0.05) hsv.v = 1;
    drawIfV();
    setColor(hexOf(hsv2rgb(hsv.h, hsv.s, hsv.v)), 'wheel');
  });

  dragOn($('bright'), e => {
    const r = $('bright').getBoundingClientRect();
    hsv.v = clamp((e.clientX - r.left) / r.width, 0, 1);
    drawIfV();
    setColor(hexOf(hsv2rgb(hsv.h, hsv.s, hsv.v)), 'wheel');
  });

  hexField().oninput = () => {
    const h = readColour(hexField().value);
    if (h) setColor(h, 'hex');
  };

  $('cpFmt').onclick = e => {
    const f = FORMATS.find(x => x === closestTo(e.target, '[data-fmt]')?.dataset.fmt);
    if (!f || !colorCard || !('tint' in colorCard)) return;
    fmt = f;
    colorCard.format?.pick(f);
    showHex(colorCard.hex);
  };

  nameField().oninput = () => {
    if (!colorCard || 'tint' in colorCard) return;
    colorCard.autoName = false;
    colorCard.label = nameField().value;
    renderCard(colorCard);
    selectOnly([colorCard.id]);
    save();
  };

  $('cpQuick').onclick = e => {
    const m = closestTo(e.target, '[data-cpq]');
    if (m) {
      cpAll = m.dataset.cpq === 'all';
      const starter: unknown = JSON.parse($('cpQuick').dataset.starter || '[]');
      $('cpQuick').innerHTML = boardColorRows(
        Array.isArray(starter) ? starter.filter(h => typeof h === 'string') : [],
        cpAll,
      );
      keepCpopOnScreen();
      return;
    }
    const b = closestTo(e.target, '[data-hex]');
    if (b) setColor(b.dataset.hex, 'quick');
  };

  $('cpSave').onclick = () => {
    const c = colorCard;
    if (!c || 'tint' in c) return;
    const name = (c.label || '').trim() || c.hex.toUpperCase(),
      hit = palette().find(p => p.hex === c.hex);
    if (hit) hit.name = name;
    else palette().push({ hex: c.hex, name });
    c.label = name;
    renderCard(c);
    selectOnly([c.id]);
    renderPalette();
    save();
    openColor(c);
    $('cpSave').textContent = 'Saved ✓';
    $('cpSave').classList.add('saved-ok');
    chirp(`Saved “${name}” to this board's colours ✦`, 3500);
  };

  $('cpDone').onclick = closeColor;

  closeOnOutsidePress('.cpop, .card.swatch, [data-col]', () => $('cpop').classList.contains('on'), closeColor);

  $('cpReset').onclick = () => {
    if (colorCard && 'tint' in colorCard) {
      colorCard.reset();
      closeColor();
    }
  };

  document.addEventListener('click', e => {
    const b = closestTo(e.target, '[data-col]');
    if (!b) return;
    const r = b.getBoundingClientRect();
    tintPicker(b.dataset.col ?? '', { x: r.left - 270, y: r.top - 120 });
  });
}
