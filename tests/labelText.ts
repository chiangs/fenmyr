// A note's label (its tag, the tab on its top edge) reads in every theme, with Follow Caelestia on and off. In dark mode the
// label sits on a dark fill, but inside a note --ink is the note's own dark ink, so text that took --ink vanished on it
// (Default dark: the same colour as its fill). This opens the app on each theme, measures the label's text against its fill
// for a Snow note and a coloured one, and holds it to the theme's own text promise.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEXT } from '../src/web/settings/derive.ts';
import { THEMES } from '../src/web/settings/themes.ts';
import { contrast } from '../src/web/ui/color.ts';
import { launch, settle } from './support/launch.ts';
import { installPaint } from './support/paint.ts';

const note = (id: string, x: number, color: string) => ({
  id,
  type: 'note',
  x,
  y: 0,
  w: 200,
  h: 100,
  r: 0,
  color,
  text: 'A note',
  tagText: 'G9',
});
const board = {
  id: 'b',
  name: 'B',
  cards: [note('white', 0, 'white'), note('butter', 260, 'butter')],
  links: [],
  tray: [],
};
const hex = (rgb: number[]) => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const fixture = (mode: string) => path.join(import.meta.dirname, `fixtures/caelestia/${mode}.json`);

for (const theme of THEMES) {
  for (const caelestia of [false, true]) {
    const what = `${theme.id}${caelestia ? ' with Caelestia' : ''}`,
      surface = `#${JSON.parse(fs.readFileSync(fixture(theme.mode), 'utf8')).colours.surface}`,
      state = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-label-'));
    fs.mkdirSync(path.join(state, 'caelestia'));
    fs.copyFileSync(fixture(theme.mode), path.join(state, 'caelestia', 'scheme.json'));
    const app = await launch({
      boards: [board],
      open: 'b',
      settings: { theme: theme.mode, [`${theme.mode}Theme`]: theme.id.replace(/-(light|dark)$/, ''), caelestia },
      env: { XDG_STATE_HOME: state },
    });
    try {
      const { page } = app;
      await installPaint(page);
      await settle(page);
      const seen = await page.evaluate(() => {
        const paint = (css: string) => window.__paint(css).slice(0, 3);
        return {
          board: getComputedStyle(document.body).getPropertyValue('--board').trim(),
          tags: ['white', 'butter'].map(id => {
            const tag = document.querySelector(`.card[data-id="${id}"] .tag`);
            if (!tag) return null;
            const css = getComputedStyle(tag);
            return { text: paint(css.color), fill: paint(css.backgroundColor) };
          }),
        };
      });
      assert.strictEqual(seen.board === surface, caelestia, `${what}: Caelestia is ${caelestia ? 'on' : 'off'}`);
      for (const [i, tag] of seen.tags.entries()) {
        assert(tag, `${what}: note ${i} has a label`);
        const got = contrast(hex(tag.text), hex(tag.fill)),
          need = TEXT[theme.target];
        assert(got >= need, `${what}: the label's text is ${got.toFixed(2)}:1 on its fill, under ${need}`);
      }
      assert.deepStrictEqual(app.errors, [], `${what}: no page errors`);
    } finally {
      await app.close();
    }
  }
}
console.log('labelText: ok');
