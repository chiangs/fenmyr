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
    // pointer and key events, kept while the tag check waits for its box to take focus
    __tagTrace?: [number, string, string][];
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

// types a line into Myra's chat box and sends it
export async function send(t: Smoke, line: string, ms = 200) {
  await t.page.fill('#mcInput', line);
  await t.page.keyboard.press('ControlOrMeta+Enter');
  await t.page.waitForTimeout(ms);
}

// a new, empty chat, with her animation stopped and the box let go
export const freshChat = (t: Smoke) =>
  t.page.evaluate(() => {
    window.__t.click('#mcNew');
    window.__fenmyr.stopAnim();
    window.__t.el('#mcInput').blur();
  });

// her chat closed the way a person folds it (her box only opens it)
export const closeChat = (t: Smoke) => t.page.evaluate(() => window.__t.click('#mcClose'));

// her chat panel open or closed, without the opening animation
export const chatOpen = (t: Smoke, on: boolean) =>
  t.page.evaluate(on => window.__t.el('#myra').classList.toggle('chat', on), on);

export const pose = (t: Smoke) => t.page.evaluate(() => window.__fenmyr.currentPose());
