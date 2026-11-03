import type { Ops } from '../shared/ops.ts';

declare global {
  interface Window {
    fenmyrHost?: { platform?: string; post(msg: unknown): void };
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
export const call = <K extends keyof Ops>(op: K, args?: Ops[K]['args']) =>
  new Promise<Ops[K]['result']>((res, rej) => {
    const id = ++seq;
    waiting.set(id, { res, rej });
    window.fenmyrHost?.post({ id, op, args: args ?? {} });
  });

// in a browser there's no host to ask, and every caller already handles a refusal
export const desktopOnly = () => Promise.reject(new Error('This needs the desktop app.'));
