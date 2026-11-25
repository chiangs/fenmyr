import type { Ops } from '../shared/ops.ts';
import { settings } from './settings/settings.ts';

declare global {
  interface Window {
    fenmyrHost?: { platform?: string; test?: boolean; post(msg: unknown): void; pathOf?(file: File): string };
    fenmyrWindow?: { minimize(): void; maximize(): void; close(): void };
    __fenmyrReply?: (id: number, ok: boolean, value: unknown) => void;
  }
}

type Waiting = { res: (value: never) => void; rej: (err: Error) => void };

// How the page reaches the host (src/host/main.ts). Outside the desktop app there is no host, and the bridge falls back.
export const native = !!window.fenmyrHost;
export const platform = native ? (window.fenmyrHost?.platform ?? 'linux') : 'web';
const waiting = new Map<number, Waiting>();
let seq = 0;
// the host answers with window.__fenmyrReply(id, ok, value)
window.__fenmyrReply = (id, ok, value) => {
  const w = waiting.get(id);
  if (!w) return;
  waiting.delete(id);
  if (ok) (w.res as (v: unknown) => void)(value);
  else w.rej(new Error(String(value)));
};
// Every op that runs Claude Code takes Myra's chosen model. The record names each one, and the compiler fails when an
// op gains a `myraModel` argument that isn't listed, so no call site passes the choice and none can forget it.
// (an op with no arguments is typed with an index signature, which would match any name)
type Names<K extends keyof Ops> = string extends keyof Ops[K]['args'] ? never : keyof Ops[K]['args'];
type RunsClaude = { [K in keyof Ops]: 'myraModel' extends Names<K> ? K : never }[keyof Ops];
const RUNS_CLAUDE: Record<RunsClaude, true> = {
  ask: true,
  rewrite: true,
  drawFill: true,
  higgsQuote: true,
  higgsMake: true,
  protoBuild: true,
  protoExplain: true,
};
const runsClaude = (op: keyof Ops): op is RunsClaude => Object.hasOwn(RUNS_CLAUDE, op);

// Asked before each of those ops goes out. While it hands back a promise the op waits for it, so the choice it sends is
// the one that check left, not a model the host has stopped listing. Set by modelPicker.ts, which this file can't import.
let beforeClaude: () => Promise<void> | undefined = () => undefined;
export const checkBeforeClaude = (check: typeof beforeClaude) => {
  beforeClaude = check;
};

export const call = <K extends keyof Ops>(op: K, args?: Ops[K]['args']) =>
  new Promise<Ops[K]['result']>((res, rej) => {
    const id = ++seq;
    waiting.set(id, { res, rej });
    const post = () => {
      const myraModel = runsClaude(op) ? settings.myraModel : undefined;
      window.fenmyrHost?.post({ id, op, args: myraModel ? { ...args, myraModel } : (args ?? {}) });
    };
    const held = runsClaude(op) ? beforeClaude() : undefined;
    // a check that fails must not strand the call
    if (held) void held.then(post, post);
    else post();
  });

// The host takes a picture of the window: an export, or a build's picture of a wireframe screen. Every such op comes
// through here, so no picture shows what is drawn only for the person looking, such as a waiting plan's preview. Two
// frames and a moment pass first: the host captures the frame last put on screen, which two frames alone don't always
// reach.
export async function picture<K extends 'captureArea' | 'export'>(op: K, args: Ops[K]['args']) {
  document.body.classList.add('picturing');
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100))));
    return await call(op, args);
  } finally {
    document.body.classList.remove('picturing');
  }
}

// in a browser there's no host to ask, and every caller already handles a refusal
export const desktopOnly = () => Promise.reject(new Error('This needs the desktop app.'));
