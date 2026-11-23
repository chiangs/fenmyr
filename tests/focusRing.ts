// Keyboard focus is visible on every control in Clear and Lantern: each control that can take focus, in the board with a
// card selected, in Settings (every tab), in Myra's chat and in a doc, draws the theme's 3 px focus ring when it is
// focused as a keyboard user focuses it, and a selected card's ring has the same weight. The stylesheet hides the
// browser's own ring on dozens of controls, so a control without a rule of its own shows nothing; the theme's ring is
// written over all of them. A theme without a ring is left as it was.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { RING, THEMES, type Theme } from '../src/web/settings/themes.ts';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const look = (t: Theme) => {
  const name = t.id.replace(/-(light|dark)$/, '');
  if (name === 'default') return { theme: t.mode };
  return t.mode === 'dark' ? { theme: 'dark', darkTheme: name } : { theme: 'light', lightTheme: name };
};
const hex = (rgb: string) => {
  const m = rgb.match(/[\d.]+/g)?.map(Number) ?? [];
  return `#${m
    .slice(0, 3)
    .map(v => Math.round(v).toString(16).padStart(2, '0'))
    .join('')}`;
};

type Seen = { control: string; style: string; width: string; color: string; offset: string };
// every visible control that takes focus, focused the way a keyboard does, and the ring it draws
const rings = (page: Page): Promise<Seen[]> =>
  page.evaluate(() => {
    const sel =
      'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
    const out: Seen[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const off =
        (el instanceof HTMLButtonElement ||
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLTextAreaElement) &&
        el.disabled;
      if (off || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      el.focus({ focusVisible: true });
      if (document.activeElement !== el || !el.matches(':focus-visible')) continue;
      const s = getComputedStyle(el);
      const control = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
      out.push({
        control,
        style: s.outlineStyle,
        width: s.outlineWidth,
        color: s.outlineColor,
        offset: s.outlineOffset,
      });
      el.blur();
    }
    return out;
  });

const board = everyOfflineCard();
const failures: string[] = [];
let seen = 0;
for (const t of THEMES.filter(x => ['clear-light', 'lantern-dark', 'midsummer-light'].includes(x.id))) {
  const app = await launch({ boards: [board], open: board.id, settings: look(t) });
  const { page } = app;
  const scenes: [string, () => Promise<void>][] = [
    ['board', async () => void (await page.evaluate(() => window.__fenmyr.selectOnly(['note'])))],
    ['settings', () => page.locator('#gearBtn').click()],
    ...['general', 'appearance', 'layout', 'board', 'myra', 'connections', 'about'].map(
      (tab): [string, () => Promise<void>] => [
        `settings ${tab}`,
        () => page.locator(`#setTabs [data-tab="${tab}"]`).click(),
      ],
    ),
    [
      'chat',
      async () => {
        await page.keyboard.press('Escape');
        await page.locator('#mPill').click();
      },
    ],
    [
      'doc',
      async () => {
        await page.keyboard.press('Escape');
        await page.locator('#cards [data-id="doc"]').dblclick();
        await page.waitForSelector('.dv-prose', { timeout: 8000 });
      },
    ],
  ];
  for (const [name, run] of scenes) {
    await run();
    await still(page);
    if (name === 'board') {
      const edge = await page.evaluate(() => {
        const card = document.querySelector('#cards [data-id="note"]');
        return card ? getComputedStyle(card, '::after').borderTopWidth : '';
      });
      assert.strictEqual(
        edge === RING.width,
        t.ring,
        `${t.id}: a selected card's ring is ${t.ring ? 'the thick one' : 'as it was'} (${edge})`,
      );
    }
    const found = await rings(page);
    seen += found.length;
    for (const f of found) {
      const ringed = f.style !== 'none' && f.width === RING.width && hex(f.color) === t.tokens.focus.toLowerCase();
      if (t.ring && !ringed)
        failures.push(
          `${t.id} / ${name}: ${f.control} draws ${f.style} ${f.width} ${hex(f.color)}, not ${RING.width} in ${t.tokens.focus}`,
        );
      if (!t.ring && f.width === RING.width && f.style !== 'none')
        failures.push(`${t.id} / ${name}: ${f.control} has the thick ring in a theme without one`);
    }
  }
  await app.close();
}
assert(seen > 200, `a few hundred controls were looked at (${seen})`);
assert.deepStrictEqual(failures.slice(0, 40), [], `${failures.length} controls without the ring`);
console.log(`FOCUS RING OK (${seen} controls)`);
