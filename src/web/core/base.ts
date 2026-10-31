// @ts-nocheck
import { session } from './state.ts';

export const COLORS = {
  white: '#ffffff',
  pink: '#ffdcd8',
  butter: '#ffe3bd',
  mint: '#e0edd3',
  lilac: '#ebe1f2',
  sky: '#d9e7f3',
  peach: '#f1ebe2',
};
export let COLOR_NAMES;

const COLOR_LABEL = {
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

export const colorLabel = n => COLOR_LABEL[n] || n[0].toUpperCase() + n.slice(1);

export const uid = () => Math.random().toString(36).slice(2, 10);

export const tilt = () => +(Math.random() * 4 - 2).toFixed(1);

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// search: the words in a query, and whether a text has all of them (the palette, templates, icons and Find all use these)
export const queryWords = q =>
  String(q || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

export const hasAll = (words, text) => words.every(w => text.includes(w));

export const find = { on: false, hits: [], i: 0, set: null, cur: null };
export function init4() {
  COLOR_NAMES = Object.keys(COLORS);

  session.board = null;
  session.view = { x: 0, y: 0, z: 1 };
  session.sel = new Set();
  session.editing = null;
  session.space = false;
  session.focusSet = null;
}
