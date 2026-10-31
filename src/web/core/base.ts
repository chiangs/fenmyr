import type { Card } from '../../shared/model.ts';
import { session } from './state.ts';

export const COLORS: Record<string, string> = {
  white: '#ffffff',
  pink: '#ffdcd8',
  butter: '#ffe3bd',
  mint: '#e0edd3',
  lilac: '#ebe1f2',
  sky: '#d9e7f3',
  peach: '#f1ebe2',
};
export const colorHex = (name = 'pink') => COLORS[name] ?? COLORS.pink ?? '';
export const COLOR_NAMES = Object.keys(COLORS);

const COLOR_LABEL: Record<string, string> = {
  white: 'Snow',
  pink: 'Lingonberry',
  butter: 'Cloudberry',
  mint: 'Moss',
  lilac: 'Heather',
  sky: 'Fjord',
  peach: 'Birch',
  gray: 'Stone',
  ink: 'Ink',
  coral: 'Rowan',
};

export const colorLabel = (n: string) => COLOR_LABEL[n] || n.charAt(0).toUpperCase() + n.slice(1);

export const uid = () => Math.random().toString(36).slice(2, 10);

export const tilt = () => +(Math.random() * 4 - 2).toFixed(1);

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// search: the words in a query, and whether a text has all of them (the palette, templates, icons and Find all use these)
export const queryWords = (q: unknown) =>
  String(q || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export const hasAll = (words: string[], text: string) => words.every(w => text.includes(w));

type FindState = { on: boolean; hits: Card[]; i: number; set: Set<string> | null; cur: string | null };
export const find: FindState = { on: false, hits: [], i: 0, set: null, cur: null };
export function init4() {
  session.view = { x: 0, y: 0, z: 1 };
  session.sel = new Set();
  session.editing = null;
  session.space = false;
  session.focusSet = null;
}
