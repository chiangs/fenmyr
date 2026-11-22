import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import { installClock } from './clock.ts';
import { still } from './settled.ts';

export const ROOT = path.resolve(import.meta.dirname, '../..');
const SCREEN = { width: 1440, height: 900 };
export const HEADLESS = ['--ozone-platform=headless', `--ozone-override-screen-size=${SCREEN.width},${SCREEN.height}`];
// Headless Chromium reports no mouse, so the app keeps its own cursor off. This tells it there is a mouse that hovers,
// for tests that check that cursor. (Not on by default: the screenshots are taken without it.)
export const MOUSE =
  '--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2';

function parseMotionDelay(text: string | undefined): number {
  if (text === undefined) return 0;
  if (!/^\d+$/.test(text)) throw new Error(`FENMYR_MOTION_DELAY takes whole milliseconds such as 250, not "${text}"`);
  return Number(text);
}
const MOTION_DELAY_MS = parseMotionDelay(process.env.FENMYR_MOTION_DELAY);

function parseCpuSlow(text: string | undefined): number {
  if (text === undefined) return 1;
  if (!/^\d+(\.\d+)?$/.test(text) || Number(text) < 1)
    throw new Error(`FENMYR_CPU_SLOW takes a rate of 1 or more such as 8, not "${text}"`);
  return Number(text);
}
const CPU_SLOW = parseCpuSlow(process.env.FENMYR_CPU_SLOW);

const QUIET = { greet: false, autoUpdate: false, caelestia: false, motion: false, tilt: false };

export type Board = { id: string; name: string; [key: string]: unknown };
export type Launched = {
  app: ElectronApplication;
  page: Page;
  data: string;
  errors: string[];
  close: () => Promise<void>;
};
type Options = {
  dir?: string;
  boards?: Board[];
  settings?: Record<string, unknown>;
  open?: string;
  flags?: string[];
  env?: Record<string, string>;
  // a data folder to use, and keep when the app closes, so a test can quit and open the app again
  data?: string;
  // a stand-in Claude Code where the real one usually lives, so asking Myra takes the same path on a machine without
  // it; a test that asks replaces the bridge's ask itself
  claude?: boolean;
  // page time driven by the test: see clock.ts
  clock?: boolean;
};

export async function launch({
  dir = ROOT,
  boards = [],
  settings = {},
  open,
  flags = [],
  env = {},
  data: kept,
  claude = false,
  clock = false,
}: Options = {}): Promise<Launched> {
  const data = kept ?? fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-h-'));
  const boardsDir = path.join(data, 'fenmyr', 'boards');
  fs.mkdirSync(boardsDir, { recursive: true });
  if (claude) {
    fs.mkdirSync(path.join(data, '.local/bin'), { recursive: true });
    fs.writeFileSync(path.join(data, '.local/bin/claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  for (const b of boards) fs.writeFileSync(path.join(boardsDir, `${b.id}.json`), JSON.stringify(b));
  const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  const app = await _electron.launch({
    args: [dir, '--no-sandbox', ...HEADLESS, ...flags],
    env: { ...process.env, ...env, XDG_DATA_HOME: data, HOME: data },
  });
  const page = await app.firstWindow();
  if (CPU_SLOW > 1)
    await (await app.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOW });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForFunction(() => window.__fenmyr?.curBoard());
  await page.waitForTimeout(500);
  const store = {
    'fenmyr:onboarded': '1',
    'fenmyr:newsSeen': version,
    'fenmyr:settings': JSON.stringify({ ...QUIET, ...settings }),
    ...(open ? { 'fenmyr:last': open } : {}),
  };
  await app.context().addInitScript(s => {
    // it runs in every frame, and a prototype's sandboxed preview has no storage
    try {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch {}
  }, store);
  if (clock) await installClock(app.context());
  // A change with no transition is delayed too, so a test that measures one at once cancels the delay for those elements (CHANGES_AT_ONCE in tests/modeBar.ts).
  if (MOTION_DELAY_MS > 0)
    await app.context().addInitScript(ms => {
      addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = `*, *::before, *::after { transition-delay: ${ms}ms !important; animation-delay: ${ms}ms !important; }`;
        document.head.append(style);
      });
    }, MOTION_DELAY_MS);
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  // sleeps on purpose: the app fits the board 400 ms after it opens, and nothing in the page says when that is over
  await settle(page);
  await still(page);
  const close = async () => {
    await app.close();
    if (!kept) fs.rmSync(data, { recursive: true, force: true });
  };
  return { app, page, data, errors, close };
}

const STARTUP_TIMERS_MS = 900;

export async function settle(page: Page, ms = STARTUP_TIMERS_MS) {
  // sleeps on purpose: it is the wait every settle(page, ms) call asks for, and the budget counts each of those calls
  await page.waitForTimeout(ms);
  await page.waitForFunction(
    () => {
      const busy = (id: string) => /saving|making/i.test(document.getElementById(id)?.textContent ?? '');
      const moving = document.getElementById('stage')?.classList.contains('moving');
      return document.fonts.status === 'loaded' && !busy('saved') && !busy('dvSaved') && !moving;
    },
    null,
    { timeout: 5000 },
  );
  await page.evaluate(() => window.__fenmyr.stopAnim());
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
