import { isRecord } from '../../shared/model.ts';

// What a piece is asked for: its words, a few numbers and lists. Myra's screens send these in a reply, so each field is
// read through the helpers below instead of being trusted.
export type Opts = Record<string, unknown>;

// one card a piece makes, placed relative to the piece's top-left corner
export type PieceItem = {
  type: 'text' | 'box' | 'icon';
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  size?: number;
  weight?: number;
  color?: string;
  font?: string;
  align?: string;
  lh?: number;
  fill?: string;
  stroke?: string;
  sw?: number;
  radius?: number;
  img?: string;
  name?: string;
};
type Style = Omit<PieceItem, 'type' | 'x' | 'y' | 'w' | 'h'>;

// bar: where a bar sits on a screen; w: the width it's made at; web: a full-width section of a web page
export type Piece = {
  icon: string;
  bar?: 'top' | 'bottom' | 'row';
  w?: number;
  web?: boolean;
  make(W: number, o: Opts): PieceItem[];
};

// words: a number counts as words too; anything else, or nothing, gives the default
export const str = (v: unknown, d = '') => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : d);
// a number, or the default for anything that isn't one (0 included, as `|| d` did)
export const numOf = (v: unknown, d: number) => (typeof v === 'number' || typeof v === 'string' ? +v : 0) || d;
// a list of records (anything else in the list counts as an empty one), or the default when there's no list
export const recs = (v: unknown, d: Opts[]): Opts[] => (Array.isArray(v) ? v.map(x => (isRecord(x) ? x : {})) : d);
export const strs = (v: unknown, d: string[]) => (Array.isArray(v) ? v.map(x => String(x)) : d);

// ready-made pieces, in clean gray; bars stretch to the screen they land on
export const T = (x: number, y: number, w: number, text: string, o: Style = {}): PieceItem => {
  const sz = o.size || 15,
    perLine = Math.max(4, Math.floor(w / (sz * 0.52))),
    lines = Math.max(1, ...text.split('\n').map(l => Math.ceil(Math.max(1, l.length) / perLine)));
  return {
    type: 'text',
    x,
    y,
    w,
    h: Math.round(sz * (o.lh || 1.3) * lines),
    text,
    size: 15,
    weight: 500,
    color: '#27272a',
    font: 'Figtree',
    ...o,
  };
};

export const B = (x: number, y: number, w: number, h: number, o: Style = {}): PieceItem => ({
  type: 'box',
  x,
  y,
  w,
  h,
  fill: '#e4e4e7',
  radius: 0,
  ...o,
});

export const IC = (x: number, y: number, name: string, s = 24, o: Style = {}): PieceItem => ({
  type: 'icon',
  x,
  y,
  w: s,
  h: s,
  name,
  color: '#3f3f46',
  ...o,
});

// a picture placeholder: a box labelled with what goes there
export const PH = (x: number, y: number, w: number, h: number, label: string, o: Style = {}) => ({
  ...B(x, y, w, h, { radius: 16, ...o }),
  img: label || 'Image',
});

export const FIELD_LABEL = (o: Opts, W: number) =>
  o.label ? [T(0, 0, W, str(o.label), { size: 13, weight: 600, color: '#3f3f46' })] : [];
