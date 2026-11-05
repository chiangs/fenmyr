import { clamp } from '../core/base.ts';
import { hexOf, normHex, rgbOf } from './color.ts';

// How a colour is written. HSL comes first, since hue, saturation and lightness are how designers think about colour.
export type ColourFormat = 'hsl' | 'rgb' | 'hex';
export const FORMATS: ColourFormat[] = ['hsl', 'rgb', 'hex'];

function hslOf(hex: string) {
  const [r = 0, g = 0, b = 0] = rgbOf(hex).map(n => n / 255),
    mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn,
    l = (mx + mn) / 2,
    s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(s * 100), Math.round(l * 100)];
}

function hexOfHsl(h: number, s: number, l: number) {
  const sat = clamp(s, 0, 100) / 100,
    light = clamp(l, 0, 100) / 100,
    a = sat * Math.min(light, 1 - light),
    f = (n: number) => {
      const k = (n + (((h % 360) + 360) % 360) / 30) % 12;
      return Math.round((light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
  return hexOf([f(0), f(8), f(4)]);
}

export function writeColour(hex: string, f: ColourFormat) {
  switch (f) {
    case 'hsl': {
      const [h, s, l] = hslOf(hex);
      return `hsl(${h} ${s}% ${l}%)`;
    }
    case 'rgb': {
      const [r, g, b] = rgbOf(hex);
      return `rgb(${r} ${g} ${b})`;
    }
    case 'hex':
      return hex;
    default: {
      const unhandled: never = f;
      return unhandled;
    }
  }
}

// A colour written as hsl(), rgb() or hex, with or without commas, as a hex; anything else is null.
export function readColour(v: string) {
  const s = v.trim().toLowerCase(),
    [a, b, c] = (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  if (a === undefined || b === undefined || c === undefined) return normHex(s);
  if (/^hsla?\(/.test(s)) return hexOfHsl(a, b, c);
  if (/^rgba?\(/.test(s)) return hexOf([clamp(a, 0, 255), clamp(b, 0, 255), clamp(c, 0, 255)]);
  return normHex(s);
}
