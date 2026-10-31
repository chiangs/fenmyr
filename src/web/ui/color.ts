type Rgb = [red: number, green: number, blue: number];

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
