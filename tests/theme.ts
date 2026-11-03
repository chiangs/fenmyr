// Follow Caelestia: with a Caelestia scheme.json present, Settings offers the switch and it's on from the start; the board takes the
// scheme's colors and light/dark mode, and follows a new scheme live. Switched off, your own colors come back. Without Caelestia it isn't shown.
//   node tests/theme.ts

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type Page } from 'playwright';
import { HEADLESS } from './support/launch.ts';

const scheme = (mode: string, surface: string, primary: string) => ({
  name: 'dynamic',
  flavour: 'default',
  mode,
  variant: 'tonalspot',
  colours: {
    surface: surface.slice(1),
    surfaceContainer: primary.slice(1),
    outlineVariant: '777777',
    primary: primary.slice(1),
    onPrimary: 'ffffff',
  },
});
// the way Caelestia saves it: a new file swapped in, not an edit
const put = (dir: string, s: object) => {
  fs.writeFileSync(path.join(dir, 'scheme.json.tmp'), JSON.stringify(s));
  fs.renameSync(path.join(dir, 'scheme.json.tmp'), path.join(dir, 'scheme.json'));
};

async function open(env: Record<string, string>) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-theme-'));
  const app = await electron.launch({
    args: [path.join(import.meta.dirname, '..'), '--no-sandbox', ...HEADLESS],
    env: { ...process.env, XDG_DATA_HOME: data, HOME: data, ...env },
  });
  const page = await app.firstWindow(),
    errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(2500);
  await page.getByText('Skip setup').click();
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  return { app, page, errors };
}
const look = (page: Page) =>
  page.evaluate(() => {
    const b = getComputedStyle(document.body),
      style = (q: string) => {
        const el = document.querySelector(q);
        return el ? getComputedStyle(el) : null;
      },
      sw = document.querySelector('[data-set="caelestia"]')?.closest('label');
    return {
      dark: document.body.classList.contains('dark'),
      board: b.getPropertyValue('--board').trim(),
      accent: b.getPropertyValue('--pink-deep').trim(),
      panel: b.getPropertyValue('--panel').trim(),
      offered: !!sw && getComputedStyle(sw).display !== 'none',
      home: style('#homeBtn')?.backgroundColor,
      rowOnRing: style('.board-row.on')?.boxShadow !== 'none',
    };
  });
const settle = () => new Promise(r => setTimeout(r, 800));
// the Follow Caelestia switch in Settings, flipped the way a click would
const follow = (page: Page, on: boolean) =>
  page.evaluate(on => {
    const t = document.querySelector('[data-set="caelestia"]');
    if (!(t instanceof HTMLInputElement)) throw new Error('no Follow Caelestia switch');
    t.checked = on;
    t.onchange?.(new Event('change'));
  }, on);

(async () => {
  // no Caelestia: nothing offered
  const first = await open({ XDG_STATE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-state-')) });
  const without = await look(first.page),
    errors1 = first.errors;
  await first.app.close();
  // Caelestia, dark
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-state-')),
    dir = path.join(state, 'caelestia');
  fs.mkdirSync(dir);
  put(dir, scheme('dark', '#1a1b26', '#bb9af7'));
  const { app, page, errors } = await open({ XDG_STATE_HOME: state });
  const on = await look(page); // on from the start
  await follow(page, false);
  await settle();
  const before = await look(page); // switched off: your own colors
  await follow(page, true);
  await settle();
  put(dir, scheme('light', '#fdf8f0', '#2e7d32'));
  await settle(); // a new wallpaper
  const live = await look(page);
  await follow(page, false);
  await settle();
  const off = await look(page);
  await app.close();
  const r = { without, errors1, on, before, live, off, errors };
  console.log(JSON.stringify(r, null, 1));
  const ok =
    !r.without.offered &&
    r.before.offered &&
    r.before.board !== '#1a1b26' &&
    r.on.dark &&
    r.on.home !== r.off.home &&
    r.on.rowOnRing &&
    !r.off.rowOnRing &&
    r.on.board === '#1a1b26' &&
    r.on.accent === '#bb9af7' &&
    r.on.panel === '#bb9af7' &&
    !r.live.dark &&
    r.live.board === '#fdf8f0' &&
    r.live.accent === '#2e7d32' &&
    r.off.board !== '#fdf8f0' &&
    r.off.accent !== '#2e7d32' &&
    !r.errors.length &&
    !r.errors1.length;
  console.log(ok ? 'THEME OK' : 'THEME FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
