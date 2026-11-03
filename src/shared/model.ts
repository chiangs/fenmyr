import { type CardType, isCardType, sizeOf } from './cardTypes.ts';
import { readRepoLink } from './repos.ts';

// What each kind of card adds. Cards also hold per-type options these fields don't list yet; typing the renderer modules adds them.
// a point on a pen path: r rounds a sharp corner; ix, iy and ox, oy are its curve handles in and out
export type InkPoint = [x: number, y: number, t?: number];
export type PathPoint = { x: number; y: number; r?: number; ix?: number; iy?: number; ox?: number; oy?: number };

type RecordingFields = {
  src?: string;
  dur?: number;
  rec?: boolean;
  count?: number | string;
  starting?: boolean;
  needTx?: boolean;
  paused?: boolean;
  // why the words couldn't be written out, shown in place of them
  txNote?: string;
};

type CardFields = {
  note: { myra?: boolean; myraMv?: string; myraImg?: string };
  todo: { items?: { t: string; done?: boolean }[] };
  title: { text?: string };
  image: { src?: string; crop?: { x: number; y: number; w: number; h: number }; cropEdit?: boolean };
  link: { url?: string; image?: string; loading?: boolean; draft?: string };
  // autoName: the label follows the colour until someone names it
  swatch: { hex: string; hideName?: boolean; hideHex?: boolean; autoName?: boolean };
  coll: {
    kids: string[];
    cols?: number;
    kanban?: boolean;
    head?: boolean;
    // a count of the cards inside, shown in the header
    count?: boolean;
    // which column each card sits in, by card id, and each column's name and card limit (0: none)
    colOf?: Record<string, number>;
    colNames?: string[];
    colLimit?: number[];
  };
  doc: { doc?: unknown; body?: string };
  canvas: { text?: string; board?: string };
  // squig: a line's style (straight, wavy, zigzag, loopy); waves, round and wobble shape it; lw: its width
  shape: {
    shape?: string;
    fill?: string;
    squig?: string;
    waves?: number;
    round?: number;
    wobble?: number;
    lw?: number;
  };
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
    ready?: boolean;
    poster?: string;
    // recorded wide with flip on, so it plays back mirrored
    mirror?: boolean;
    vw?: number;
    vh?: number;
  };
  // kind: track, album, playlist, episode, show or artist; sid: Spotify's id for it
  spotify: {
    url?: string;
    title?: string;
    image?: string;
    kind?: string;
    sid?: string;
    loading?: boolean;
    draft?: string;
  };
  // pts: x, y and when it was drawn (ms); size: a number, or s / m / l in older drawings
  ink: { pts: InkPoint[]; pen?: string; size?: number | string; ink?: string; ow: number; oh: number };
  // device: the screen it's sized for (iPhone, Desktop…)
  frame: { name?: string; device?: string; fill?: string };
  section: { text?: string };
  box: { img?: string; src?: string; fill?: string; opacity?: number };
  text: { text?: string; size?: number; weight?: number };
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
  path: { pts: PathPoint[]; closed?: boolean; fill?: string; ow: number; oh: number };
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
  // a named text size (s, l, xl) or the exact scale left by Shift-resizing
  fs?: string | number;
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
  // a name given in the Layers panel, and a group's name (kept on each card in the group)
  ln?: string;
  gn?: string;
  // in Unsorted: cards that went in joined by connectors share this, so they come back out together
  tie?: string;
};

export type Card = { [T in CardType]: CardBase & { type: T } & CardFields[T] }[CardType];
export type CardOf<T extends CardType> = Extract<Card, { type: T }>;

export type View = { x: number; y: number; z: number };
// pa, pb: an end pinned to a spot on its card's edge (fractions of its width and height); bend: how far it curves;
// w: its weight (2, 4 or 6) and color its colour
export type Link = {
  id: string;
  a: string;
  b: string;
  arrow?: boolean;
  pa?: { u: number; v: number };
  pb?: { u: number; v: number };
  bend?: number;
  w?: number;
  color?: string;
  dash?: boolean;
};

// What a board or project may read from one vault: '' in folders is the whole vault; ai lets Myra send matching notes to Claude.
export type VaultGrant = { vault: string; folders: string[]; ai: boolean; write: boolean; writeTo: string };

// who: 'me' or 'myra'; t: when it was said
export type ChatMsg = { who: string; text: string; t: number };
// an earlier chat, put away by New chat
type SavedChat = { id: string; title: string; t: number; msgs: ChatMsg[] };

// A prototype board's code lives in one folder of its project's repo. The board finds it by dir, never by its name,
// so renaming or refiling the board can't lose it.
export type Proto = { dir: string; stack: 'react' | 'html' };

type BoardBase = {
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
  chat?: ChatMsg[];
  chats?: SavedChat[];
  // its own vault access; without it the board follows its project
  vaultAccess?: VaultGrant[];
};
type BoardKind = { kind?: undefined; proto?: undefined } | { kind: 'prototype'; proto: Proto };
export type Board = BoardBase & BoardKind;

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
export type StoredBoard = Partial<BoardBase> & { id: string } & BoardKind;

export type Project = {
  id: string;
  name: string;
  color?: string;
  open?: boolean;
  cover?: string;
  vaults?: VaultGrant[];
  // the git repo its prototypes are written to, by absolute path on this computer, and its copy on GitHub with the gh
  // account that reaches it
  repo?: { path: string; github?: { owner: string; name: string; account: string } };
};
export type Folder = {
  id: string;
  name: string;
  project?: string | null;
  parent?: string | null;
  open?: boolean;
  cover?: string;
  // a prototyping folder holds only prototype boards
  kind?: 'prototyping';
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

// cards kept somewhere other than a board (a template), read the same way
export const readCards = (x: unknown): Card[] => (Array.isArray(x) ? x.map(readCard).filter(c => c !== null) : []);

export function readLinks(x: unknown): Link[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter(isRecord)
    .flatMap(l =>
      typeof l.id === 'string' && typeof l.a === 'string' && typeof l.b === 'string'
        ? [{ ...l, id: l.id, a: l.a, b: l.b, ...(typeof l.arrow === 'boolean' ? { arrow: l.arrow } : {}) }]
        : [],
    );
}

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
  const proto = raw.kind === 'prototype' ? readProto(raw.proto) : null;
  const board: StoredBoard = {
    ...raw,
    id: raw.id,
    cards: cards(raw.cards),
    tray: cards(raw.tray),
    ...(proto ? { kind: 'prototype', proto } : { kind: undefined, proto: undefined }),
  };
  const access = readGrants(raw.vaultAccess);
  if (access) board.vaultAccess = access;
  else delete board.vaultAccess;
  if (Array.isArray(raw.chat)) board.chat = readMsgs(raw.chat);
  else delete board.chat;
  if (Array.isArray(raw.chats))
    board.chats = raw.chats.filter(isRecord).map(c => ({
      id: typeof c.id === 'string' ? c.id : '',
      title: typeof c.title === 'string' ? c.title : 'Chat',
      t: typeof c.t === 'number' ? c.t : 0,
      msgs: readMsgs(c.msgs),
    }));
  else delete board.chats;
  return board;
}

// flat under prototypes/, so where the board sits in the library never decides where its code is
export const PROTO_DIR = /^prototypes\/[a-z0-9]+(-[a-z0-9]+)*$/;
const STACKS: readonly Proto['stack'][] = ['react', 'html'];

function readProto(x: unknown): Proto | null {
  if (!isRecord(x) || typeof x.dir !== 'string' || !PROTO_DIR.test(x.dir)) return null;
  return { dir: x.dir, stack: STACKS.find(s => s === x.stack) ?? 'react' };
}

const readMsgs = (x: unknown): ChatMsg[] =>
  (Array.isArray(x) ? x : []).filter(isRecord).map(m => ({
    who: typeof m.who === 'string' ? m.who : 'myra',
    text: typeof m.text === 'string' ? m.text : '',
    t: typeof m.t === 'number' ? m.t : 0,
  }));

function readGrants(x: unknown): VaultGrant[] | undefined {
  if (!Array.isArray(x)) return undefined;
  return x.filter(isRecord).flatMap(g =>
    typeof g.vault === 'string'
      ? [
          {
            vault: g.vault,
            folders: Array.isArray(g.folders) ? g.folders.filter(f => typeof f === 'string') : [],
            ai: g.ai === true,
            write: g.write === true,
            writeTo: typeof g.writeTo === 'string' ? g.writeTo : 'Myra',
          },
        ]
      : [],
  );
}

function readProject(x: unknown): Project[] {
  if (!isNamed<Project>(x)) return [];
  const p: Project = { ...x };
  const vaults = readGrants(Reflect.get(x, 'vaults'));
  if (vaults) p.vaults = vaults;
  else delete p.vaults;
  const repo = readRepoLink(Reflect.get(x, 'repo'));
  if (repo) p.repo = repo;
  else delete p.repo;
  return [p];
}

function readFolder(x: unknown): Folder[] {
  if (!isNamed<Folder>(x)) return [];
  const f: Folder = { ...x };
  if (Reflect.get(x, 'kind') !== 'prototyping') delete f.kind;
  return [f];
}

// Whatever this returns gets saved back, so it keeps every readable row: one bad row must not empty the library.
export function parseLibrary(raw: unknown): Library {
  if (Array.isArray(raw)) return { projects: [], folders: raw.flatMap(readFolder), order: {} };
  if (!isRecord(raw)) return { projects: [], folders: [], order: {} };
  const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
  const order: BoardOrder = {};
  if (isRecord(raw.order))
    for (const [k, v] of Object.entries(raw.order)) order[k] = list(v).filter(id => typeof id === 'string');
  return {
    projects: list(raw.projects).flatMap(readProject),
    folders: list(raw.folders).flatMap(readFolder),
    order,
  };
}
