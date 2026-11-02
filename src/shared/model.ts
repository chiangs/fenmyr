import { type CardType, isCardType, sizeOf } from './cardTypes.ts';

// What each kind of card adds. Cards also hold per-type options these fields don't list yet; typing the renderer modules adds them.
type RecordingFields = {
  src?: string;
  dur?: number;
  rec?: boolean;
  count?: number | string;
  starting?: boolean;
  needTx?: boolean;
};

type CardFields = {
  note: { myra?: boolean; myraMv?: string; myraImg?: string };
  todo: { items?: { t: string; done?: boolean }[] };
  title: { text?: string };
  image: { src?: string; crop?: { x: number; y: number; w: number; h: number }; cropEdit?: boolean };
  link: { url?: string; image?: string; loading?: boolean; draft?: string };
  swatch: { hex: string; hideName?: boolean; hideHex?: boolean };
  coll: {
    kids: string[];
    cols?: number;
    kanban?: boolean;
    head?: boolean;
    // which column each card sits in, by card id, and each column's name and card limit (0: none)
    colOf?: Record<string, number>;
    colNames?: string[];
    colLimit?: number[];
  };
  doc: { doc?: unknown; body?: string };
  canvas: { text?: string; board?: string };
  shape: { shape?: string; fill?: string };
  stamp: { src?: string; emoji?: string; mv?: string };
  audio: RecordingFields & { ready?: boolean; wave?: number[] };
  video: RecordingFields & {
    muted?: boolean;
    txShown?: boolean;
    saving?: boolean;
    pct?: number;
    camErr?: string;
    camRest?: boolean;
    vert?: boolean;
  };
  spotify: { url?: string; title?: string; image?: string };
  ink: { pts: [number, number][]; pen?: string; size?: number; ink?: string; ow: number; oh: number };
  frame: { name?: string };
  section: { text?: string };
  box: { img?: string; src?: string };
  text: { text?: string };
  icon: { name?: string };
  font: { font?: string; text?: string };
  vnote: {
    vault?: string;
    path?: string;
    excerpt?: string;
    side?: string;
    blocked?: boolean;
    missing?: boolean;
    props?: [string, string][];
  };
  path: { pts: { x: number; y: number; r?: number }[]; closed?: boolean; fill?: string; ow: number; oh: number };
};

// Fields Myra and the selection bar can set on any kind of card, so they live here.
type CardBase = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  rot?: number;
  color?: string;
  onFrame?: string;
  // cards grouped together share this id and move as one
  group?: string;
  name?: string;
  text?: string;
  title?: string;
  desc?: string;
  label?: string;
  hex?: string;
  font?: string;
  fs?: string;
  due?: string;
  tags?: string[];
  tagText?: string;
  // the height someone gave a note or checklist themselves; fitting the words never shrinks it below this
  userH?: number;
  bold?: boolean;
  italic?: boolean;
  under?: boolean;
  strike?: boolean;
  hidden?: boolean;
  fixedW?: boolean;
  tilted?: boolean;
  align?: string;
  tcase?: string;
  lh?: number;
  ls?: number;
  stroke?: string;
  sw?: number;
  sdash?: boolean | string;
  dl?: number;
  dg?: number;
  cap?: string;
  radius?: number;
  tc?: string;
  locked?: boolean;
  txNote?: string;
  paused?: boolean;
};

export type Card = { [T in CardType]: CardBase & { type: T } & CardFields[T] }[CardType];
export type CardOf<T extends CardType> = Extract<Card, { type: T }>;

export type View = { x: number; y: number; z: number };
export type Link = { id: string; a: string; b: string; arrow?: boolean };

export type Board = {
  id: string;
  name: string;
  color?: string;
  cards: Card[];
  links: Link[];
  tray: Card[];
  trayLinks?: Link[];
  palette?: { hex: string; name?: string }[];
  view?: View;
  folder?: string | null;
  parent?: string | null;
  tags?: string[];
  bg?: unknown;
  chat?: unknown;
  chats?: unknown;
};

// True only while the app runs. A video saved with `saving` would show "Saving…" forever after reopening.
// `rec` and `paused` stay: reopening a board finds an interrupted recording by them.
const RUNNING_ONLY = ['count', 'starting', 'saving', 'pct', 'camErr', 'camRest', 'loading', 'cropEdit'];

function storedCard<T extends object>(card: T): T {
  if (!RUNNING_ONLY.some(k => k in card)) return card;
  const copy = { ...card };
  for (const k of RUNNING_ONLY) Reflect.deleteProperty(copy, k);
  return copy;
}

export function storedBoard<T extends { cards?: object[]; tray?: object[] }>(board: T): T {
  return { ...board, cards: board.cards?.map(storedCard), tray: board.tray?.map(storedCard) };
}

// A board as read from disk: older or hand-written files can lack any list, and opening one fills them in.
export type StoredBoard = Partial<Board> & { id: string };

export type Project = { id: string; name: string; color?: string; open?: boolean; cover?: string };
export type Folder = {
  id: string;
  name: string;
  project?: string | null;
  parent?: string | null;
  open?: boolean;
  cover?: string;
};
export type BoardOrder = Record<string, string[]>;
type Library = { projects: Project[]; folders: Folder[]; order: BoardOrder };

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isNamed = <T extends { id: string; name: string }>(x: unknown): x is T =>
  isRecord(x) && typeof x.id === 'string' && typeof x.name === 'string';

const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

// Checks what every card needs plus the fields a type can't do without; the optional per-type fields are read where they're used.
function isCard(x: unknown): x is Card {
  if (!isRecord(x) || typeof x.id !== 'string' || !isCardType(x.type)) return false;
  if (![x.x, x.y, x.w, x.h].every(isNum)) return false;
  if (x.type === 'swatch') return typeof x.hex === 'string';
  if (x.type === 'coll') return Array.isArray(x.kids) && x.kids.every(k => typeof k === 'string');
  return true;
}

export const isCardOf = <T extends CardType>(x: unknown, type: T): x is CardOf<T> => isCard(x) && x.type === type;

// Anything saved back after opening a board is all it keeps, so a card missing a number gets a default instead of being
// dropped. Only a card with no id or an unknown type is left out, since it can't be shown.
function readCard(x: unknown): Card | null {
  if (!isRecord(x) || !isCardType(x.type)) return null;
  const [width, height] = sizeOf(x.type),
    filled = {
      ...x,
      x: isNum(x.x) ? x.x : 0,
      y: isNum(x.y) ? x.y : 0,
      w: isNum(x.w) ? x.w : width,
      h: isNum(x.h) ? x.h : height,
      ...(x.type === 'swatch' && typeof x.hex !== 'string' ? { hex: '#ffffff' } : {}),
      ...(x.type === 'coll' && !Array.isArray(x.kids) ? { kids: [] } : {}),
    };
  return isCard(filled) ? filled : null;
}

// A board file read from disk.
export function parseBoard(raw: unknown): StoredBoard | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const cards = (x: unknown) => (Array.isArray(x) ? x.map(readCard).filter(c => c !== null) : undefined);
  return { ...raw, id: raw.id, cards: cards(raw.cards), tray: cards(raw.tray) };
}

// Whatever this returns gets saved back, so it keeps every readable row: one bad row must not empty the library.
export function parseLibrary(raw: unknown): Library {
  if (Array.isArray(raw)) return { projects: [], folders: raw.filter(isNamed<Folder>), order: {} };
  if (!isRecord(raw)) return { projects: [], folders: [], order: {} };
  const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  const order: BoardOrder = {};
  if (isRecord(raw.order))
    for (const [k, v] of Object.entries(raw.order)) order[k] = list(v).filter(id => typeof id === 'string');
  return {
    projects: list(raw.projects).filter(isNamed<Project>),
    folders: list(raw.folders).filter(isNamed<Folder>),
    order,
  };
}
