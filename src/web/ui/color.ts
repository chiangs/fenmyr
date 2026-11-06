export type Rgb = [red: number, green: number, blue: number];

const channel = (n: number) => Math.round(n).toString(16).padStart(2, '0');

export const rgbOf = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

export const hexOf = ([r, g, b]: Rgb) => `#${channel(r)}${channel(g)}${channel(b)}`;

// Accepts "abc", "#abc" or "#aabbcc"; anything else is null.
export function normHex(v: unknown) {
  let h = String(v || '')
    .trim()
    .replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map(x => x + x).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
}

// A computed style's rgb(...) or a hex, as a hex.
export function cssToHex(v: unknown) {
  if (!v) return null;
  const s = String(v);
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  const [r, g, b] = s.match(/\d+(\.\d+)?/g) ?? [];
  return r && g && b ? hexOf([Math.trunc(+r), Math.trunc(+g), Math.trunc(+b)]) : null;
}

export function luminance(hex: string) {
  const [r, g, b] = rgbOf(hex).map(n => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

export function mixHex(a: string, b: string, k: number) {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  return hexOf([ar * (1 - k) + br * k, ag * (1 - k) + bg * k, ab * (1 - k) + bb * k]);
}

// WCAG contrast between two colours, from 1 to 21
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

export type Vision = 'typical' | 'protan' | 'deutan' | 'tritan';
// Machado, Oliveira and Fernandes (2009), full severity, applied to linear RGB
const SIMULATE: Record<Exclude<Vision, 'typical'>, number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const linear = (n: number) => {
  const c = n / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
// OKLab of a colour as someone with that vision sees it
function seenOklab(hex: string, vision: Vision): Rgb {
  let rgb = rgbOf(hex).map(linear);
  if (vision !== 'typical') {
    const m = SIMULATE[vision];
    rgb = m.map(row =>
      Math.min(
        1,
        Math.max(
          0,
          row.reduce((sum, k, i) => sum + k * (rgb[i] ?? 0), 0),
        ),
      ),
    );
  }
  const [r = 0, g = 0, b = 0] = rgb,
    l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
// how far apart two colours look, in OKLab; below about 0.02 they read as the same colour
export function apart(a: string, b: string, vision: Vision) {
  const p = seenOklab(a, vision),
    q = seenOklab(b, vision);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

// OKLCH: lightness 0–1, chroma, hue in radians. Lightness here is even to the eye, unlike HSL's.
type Oklch = [l: number, c: number, h: number];
function oklchOf(hex: string): Oklch {
  const [r = 0, g = 0, b = 0] = rgbOf(hex).map(linear),
    l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b),
    L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
const encode = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
function hexOfOklch([L, C, H]: Oklch) {
  const A = C * Math.cos(H),
    B = C * Math.sin(H),
    l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3,
    m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3,
    s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3,
    clip = (x: number) => Math.min(255, Math.max(0, encode(Math.min(1, Math.max(0, x)))));
  return hexOf([
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

// The colour's own hue, made darker on light backgrounds or lighter on dark ones until it reads at `target` against
// every one of them. Used for amber text from a custom accent, so a pale accent still makes readable links.
export function readableShade(hex: string, against: string[], target: number) {
  const [L, C, H] = oklchOf(hex),
    darker = against.reduce((n, b) => n + luminance(b), 0) / Math.max(1, against.length) > 0.18,
    reads = (h: string) => against.every(b => contrast(h, b) >= target);
  for (let i = 0; i <= 100; i++) {
    const h = hexOfOklch([Math.min(1, Math.max(0, L + (darker ? -i : i) * 0.01)), C, H]);
    if (reads(h)) return h;
  }
  return darker ? '#000000' : '#ffffff';
}

// whichever ink reads better on a fill
export const bestInk = (fill: string, inks: string[]) =>
  inks.reduce((a, b) => (contrast(b, fill) > contrast(a, fill) ? b : a));
