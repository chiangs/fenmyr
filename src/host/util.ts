import { type ChildProcessByStdio, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import P from './paths.ts';

export type Untrusted<T> = { readonly [K in keyof T]?: unknown };

export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
export const text = (x: unknown): string => (typeof x === 'string' ? x : '');
export const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter(s => typeof s === 'string') : []);

export function readJSON(f: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return undefined;
  }
}

// a temporary file swapped in, so a crash mid-save never leaves half a file
export function writeAtomic(f: string, data: string) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, f);
}

// JSON can't hold NaN or infinity; the Mac app swaps them for 0, so this does too
export const jsonSafe = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x) ? 0 : x));

export function which(name: string, dirs = (process.env.PATH || '').split(':')): string | null {
  for (const d of dirs) {
    const f = path.join(d, name);
    try {
      fs.accessSync(f, fs.constants.X_OK);
      return f;
    } catch {}
  }
  return null;
}

export type RunResult = { code: number | null; out: Buffer; err: Buffer };

const home = os.homedir();
// An app opened from the desktop gets a short PATH, so the usual install spots are added.
export const pathDirs = () =>
  [
    ...(process.env.PATH || '').split(':'),
    `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ].filter(Boolean);
export const env = () => ({ ...process.env, PATH: pathDirs().join(':') });

// collects what the program prints and stops it after `timeout` seconds; `input` is what it reads on stdin, which is
// /dev/null without it. `signal` stops it at once when it aborts, and a program that is stopped before it starts never
// does; it ends as it does when it closes.
export function run(
  cmd: string,
  args: string[],
  timeout: number,
  extraEnv: Record<string, string> = {},
  cwd = P.support,
  input?: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  return new Promise(resolve => {
    const out: Buffer[] = [],
      err: Buffer[] = [];
    let p: ChildProcessByStdio<Writable | null, Readable, Readable>;
    if (signal?.aborted)
      return resolve({ code: -1, out: Buffer.alloc(0), err: Buffer.from('Stopped before it began.') });
    try {
      fs.mkdirSync(cwd, { recursive: true }); // the folder we run in has to exist (a fresh install, or a test)
    } catch {}
    try {
      const opts = { cwd, env: { ...env(), ...extraEnv } };
      p =
        input === undefined
          ? spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
          : spawn(cmd, args, { ...opts, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: -1, out: Buffer.alloc(0), err: Buffer.from(e instanceof Error ? e.message : String(e)) });
    }
    // A program that exits without reading its input (a test's stand-in, or an old Claude Code) fails the write with
    // EPIPE, and a stream error nobody listens to would crash the host.
    p.stdin?.on('error', () => {});
    p.stdin?.end(input);
    const stop = () => p.kill('SIGTERM');
    const killer = setTimeout(stop, timeout * 1000);
    signal?.addEventListener('abort', stop, { once: true });
    const ended = () => {
      clearTimeout(killer);
      signal?.removeEventListener('abort', stop);
    };
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => err.push(d));
    p.on('error', e => {
      ended();
      resolve({ code: -1, out: Buffer.concat(out), err: Buffer.from(e.message) });
    });
    p.on('close', code => {
      ended();
      resolve({ code, out: Buffer.concat(out), err: Buffer.concat(err) });
    });
  });
}
