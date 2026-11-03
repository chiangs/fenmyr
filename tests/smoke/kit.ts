import type { ElectronApplication, Page } from 'playwright';

// Helpers the smoke checks use inside the page. A lookup that finds nothing throws with the selector, so a
// check that breaks says where instead of failing on null.
type PageKit = {
  wait(ms: number): Promise<void>;
  el(sel: string): HTMLElement;
  input(sel: string): HTMLInputElement;
  field(sel: string): HTMLInputElement | HTMLTextAreaElement;
  all(sel: string): HTMLElement[];
  click(sel: string): void;
  text(sel: string): string;
};

declare global {
  interface Window {
    __t: PageKit;
    // the arguments the stand-in Claude Code was last run with
    __readArgs(): Promise<string>;
  }
}

// runs in the page, so it can't use anything from this file
export function installPageKit() {
  const el = (sel: string) => {
    const e = document.querySelector(sel);
    if (!(e instanceof HTMLElement)) throw new Error(`no ${sel}`);
    return e;
  };
  window.__t = {
    wait: ms => new Promise(res => setTimeout(res, ms)),
    el,
    input: sel => {
      const e = document.querySelector(sel);
      if (!(e instanceof HTMLInputElement)) throw new Error(`no input ${sel}`);
      return e;
    },
    field: sel => {
      const e = document.querySelector(sel);
      if (!(e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement)) throw new Error(`no field ${sel}`);
      return e;
    },
    all: sel => [...document.querySelectorAll(sel)].filter(e => e instanceof HTMLElement),
    click: sel => el(sel).click(),
    text: sel => el(sel).textContent ?? '',
  };
}

// one run of the smoke test: the app, its window, its data folder, and what each check found
export type Smoke = {
  app: ElectronApplication;
  page: Page;
  data: string;
  out: string;
  errors: string[];
  results: Record<string, unknown>;
  failures: string[];
  // a single check; seen is kept in the results so a failure shows what was found
  check(name: string, ok: boolean, seen?: unknown): void;
  // every part must hold; each one that doesn't is reported by name
  checkAll(name: string, parts: Record<string, unknown>): void;
};

export function makeSmoke(o: Pick<Smoke, 'app' | 'page' | 'data' | 'out' | 'errors'>): Smoke {
  const results: Record<string, unknown> = {},
    failures: string[] = [];
  return {
    ...o,
    results,
    failures,
    check(name, ok, seen) {
      if (seen !== undefined) results[name] = seen;
      if (!ok) failures.push(name);
    },
    checkAll(name, parts) {
      results[name] = parts;
      for (const [k, v] of Object.entries(parts)) if (!v) failures.push(`${name}.${k}`);
    },
  };
}
