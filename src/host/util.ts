import { type ChildProcessByStdio, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
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
const env = () => ({
  ...process.env,
  PATH: [process.env.PATH || '', `${home}/.local/bin`, '/usr/local/bin', '/usr/bin'].join(':'),
});

// collects what the program prints and stops it after `timeout` seconds
export function run(cmd: string, args: string[], timeout: number): Promise<RunResult> {
  return new Promise(resolve => {
    const out: Buffer[] = [],
      err: Buffer[] = [];
    let p: ChildProcessByStdio<null, Readable, Readable>;
    try {
      fs.mkdirSync(P.support, { recursive: true }); // the folder we run in has to exist (a fresh install, or a test)
    } catch {}
    try {
      p = spawn(cmd, args, { cwd: P.support, env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: -1, out: Buffer.alloc(0), err: Buffer.from(e instanceof Error ? e.message : String(e)) });
    }
    const killer = setTimeout(() => p.kill('SIGTERM'), timeout * 1000);
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => err.push(d));
    p.on('error', e => {
      clearTimeout(killer);
      resolve({ code: -1, out: Buffer.concat(out), err: Buffer.from(e.message) });
    });
    p.on('close', code => {
      clearTimeout(killer);
      resolve({ code, out: Buffer.concat(out), err: Buffer.concat(err) });
    });
  });
}
