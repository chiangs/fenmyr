import type { GooColors } from '../goo.ts';

// ---------- settings: Myra's color and greeting, her helpers, how the board looks ----------
// Myra's colors: a cloudberry as it ripens, plus a couple of playful ones. B body, S bead shine, D seams and shade
const GOLDEN: GooColors = { B: '#f6a63c', S: '#ffe0a0', D: '#de8526' };
export const MYRA_COLORS: Record<string, GooColors> = {
  golden: GOLDEN,
  honey: { B: '#ffc74a', S: '#fff1bd', D: '#e39d1d' },
  amber: { B: '#e88a24', S: '#ffd08a', D: '#b8621a' },
  blush: { B: '#ff9d7a', S: '#ffe1d3', D: '#e0684a' },
  unripe: { B: '#e2553c', S: '#ffb5a3', D: '#b33a25' },
  moss: { B: '#8fc65a', S: '#e4f4c4', D: '#5c9a35', L: '#2f9e72', l: '#1f6e50' },
  frost: { B: '#9cc7ea', S: '#e3f1fc', D: '#5f97c9' },
  night: { B: '#4a4f7a', S: '#8d93c9', D: '#2b2e4f' },
};

import { isRecord } from '../../shared/model.ts';
import type { Chattiness } from '../../shared/ops.ts';

// keeps the default's type as all three values, not just 'normal'
const chattiness = (c: Chattiness) => c;
const NORMAL = chattiness('normal');
const isChat = (v: unknown): v is Chattiness => v === 'quiet' || v === 'normal' || v === 'chatty';

const DEFAULTS = {
  defaultFont: '',
  iconStyle: 'regular',
  winButtons: false,
  webAccess: false,
  caelestia: true,
  autoUpdate: true,
  myraName: '',
  myraCalm: 'lively',
  myraChar: true,
  tbSize: 'm',
  dblNote: true,
  wLayers: true,
  wColors: true,
  wDesign: true,
  wTray: true,
  myra: 'golden',
  greet: true,
  grid: true,
  tilt: true,
  motion: true,
  keys: true,
  theme: 'system',
  chat: NORMAL,
  emoji: true,
  noteColor: 'random',
  snap: false,
  ai: true,
  mobbin: true,
  higgs: true,
  skipPlans: false,
  chatKeep: 'board',
  chatMax: '60',
  cursor: '#f6b45e',
  fancyCursor: true,
};
type Defaults = typeof DEFAULTS;

export const myraColors = (name: string) => MYRA_COLORS[name] ?? GOLDEN;
// the switches in Settings (data-set) and the choices (data-seg) name these
type Flag = { [K in keyof Defaults]: Defaults[K] extends boolean ? K : never }[keyof Defaults];
// how chatty she is has its own three values, so it's set through setChoice's own check
type Choice = Exclude<{ [K in keyof Defaults]: Defaults[K] extends string ? K : never }[keyof Defaults], 'chat'>;
type Colors = Record<string, string>;

export type Settings = Defaults & {
  // the smallest height each panel was dragged to, by panel
  panelH: Record<string, number>;
  // colours chosen for light and dark mode, by name
  colors: { light: Colors; dark: Colors };
  name?: string;
  wireStyle?: { w?: number; color?: string };
  toolbar?: { order: string[]; hidden: string[] };
  micId?: string;
  camId?: string;
  camFlip?: boolean;
  // 'MM-DD'
  birthday?: string;
  layout?: { left: string[]; right: string[] } | null;
  gridShape?: string;
};

export let settings: Settings;

const strings = (x: unknown) => (Array.isArray(x) ? x.filter(v => typeof v === 'string') : []);
function colorsIn(x: unknown): Colors {
  const out: Colors = {};
  if (isRecord(x)) for (const [k, v] of Object.entries(x)) if (typeof v === 'string') out[k] = v;
  return out;
}
function heightsIn(x: unknown) {
  const out: Record<string, number> = {};
  if (isRecord(x)) for (const [k, v] of Object.entries(x)) if (typeof v === 'number') out[k] = v;
  return out;
}

// What's saved is read back field by field: one of the wrong type falls back to its default rather than reaching the app.
function readSettings(raw: unknown): Settings {
  const saved = isRecord(raw) ? raw : {};
  const known: Record<string, unknown> = { ...DEFAULTS };
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof saved[k] === typeof v) known[k] = saved[k];
  const out: Settings = {
    ...DEFAULTS,
    ...Object.fromEntries(Object.entries(known)),
    panelH: heightsIn(saved.panelH),
    colors: isRecord(saved.colors)
      ? { light: colorsIn(saved.colors.light), dark: colorsIn(saved.colors.dark) }
      : { light: {}, dark: {} },
  };
  out.chat = isChat(saved.chat) ? saved.chat : NORMAL;
  for (const k of ['name', 'micId', 'camId', 'birthday', 'gridShape'] as const)
    if (typeof saved[k] === 'string') out[k] = saved[k];
  if (typeof saved.camFlip === 'boolean') out.camFlip = saved.camFlip;
  if (isRecord(saved.wireStyle)) {
    const { w, color } = saved.wireStyle;
    out.wireStyle = { ...(typeof w === 'number' ? { w } : {}), ...(typeof color === 'string' ? { color } : {}) };
  }
  if (isRecord(saved.toolbar))
    out.toolbar = { order: strings(saved.toolbar.order), hidden: strings(saved.toolbar.hidden) };
  if (isRecord(saved.layout)) out.layout = { left: strings(saved.layout.left), right: strings(saved.layout.right) };
  return out;
}

const isFlag = (k: string): k is Flag => Object.hasOwn(DEFAULTS, k) && typeof Reflect.get(DEFAULTS, k) === 'boolean';
const isChoice = (k: string): k is Choice =>
  k !== 'chat' && Object.hasOwn(DEFAULTS, k) && typeof Reflect.get(DEFAULTS, k) === 'string';

export const flagOn = (k: string) => isFlag(k) && settings[k];
export function setFlag(k: string, on: boolean) {
  if (isFlag(k)) settings[k] = on;
}
export const choiceOf = (k: string) => (k === 'chat' ? settings.chat : isChoice(k) ? settings[k] : undefined);
export function setChoice(k: string, v: string) {
  if (k === 'chat') {
    if (isChat(v)) settings.chat = v;
  } else if (isChoice(k)) settings[k] = v;
}

export function init25() {
  let raw: unknown = {};
  try {
    raw = JSON.parse(localStorage.getItem('fenmyr:settings') || '{}');
  } catch {}
  settings = readSettings(raw);
}
