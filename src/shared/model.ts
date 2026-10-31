import type { CardType } from './cardTypes.ts';

// What each kind of card adds. Cards also hold per-type options these fields don't list yet; typing the renderer modules adds them.
type CardFields = {
  note: { name?: string; text?: string; tags?: string[]; myra?: boolean };
  todo: { text?: string; items?: { t: string; done?: boolean }[] };
  title: { text?: string };
  image: { src?: string; crop?: { x: number; y: number; w: number; h: number } };
  link: { url?: string; title?: string; desc?: string; image?: string };
  swatch: { hex: string; label?: string };
  coll: { text?: string; kids?: string[]; kanban?: boolean };
  doc: { text?: string; doc?: unknown };
  canvas: { text?: string; board?: string };
  shape: { shape?: string; fill?: string; text?: string };
  stamp: { src?: string; emoji?: string };
  audio: { title?: string; src?: string; dur?: number; text?: string; wave?: number[]; rec?: boolean };
  video: { title?: string; src?: string; dur?: number; text?: string; rec?: boolean };
  spotify: { url?: string; title?: string; image?: string };
  ink: { pts: [number, number][]; pen?: string; size?: number; ink?: string; ow: number; oh: number };
  frame: { name?: string };
  section: { text?: string };
  box: { img?: string; src?: string };
  text: { text?: string };
  icon: { name?: string };
  font: { font?: string; text?: string };
  vnote: { title?: string; excerpt?: string; tags?: string[]; side?: string };
  path: { pts: { x: number; y: number; r?: number }[]; closed?: boolean; ow: number; oh: number };
};

type CardBase = { id: string; x: number; y: number; w: number; h: number; r?: number; color?: string };
type Card = { [T in CardType]: CardBase & { type: T } & CardFields[T] }[CardType];

export type Board = { id: string; name?: string; cards?: Card[]; tray?: Card[]; [key: string]: unknown };

// True only while the app runs. A video saved with `saving` would show "Saving…" forever after reopening.
// `rec` and `paused` stay: reopening a board finds an interrupted recording by them.
const RUNNING_ONLY = ['count', 'starting', 'saving', 'pct', 'camErr', 'camRest', 'loading', 'cropEdit'];

function storedCard<T extends object>(card: T): T {
  if (!RUNNING_ONLY.some(k => k in card)) return card;
  const copy = { ...card };
  for (const k of RUNNING_ONLY) Reflect.deleteProperty(copy, k);
  return copy;
}

export function storedBoard<T extends Board>(board: T): T {
  return { ...board, cards: board.cards?.map(storedCard), tray: board.tray?.map(storedCard) };
}
