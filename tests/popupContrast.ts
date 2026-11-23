// The slash menu and the shared dialog read in every look: each of their words against what is behind them, in light and
// in dark, in Default and in each theme. Both once had a white background in the dark looks, with their light words on it.
import assert from 'node:assert';
import { THEMES } from '../src/web/settings/themes.ts';
import { launch } from './support/launch.ts';
import { installPaint } from './support/paint.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'b', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
  settings: { ai: false },
});
const { page } = l;
const { openChat, menuShown } = templateChat(page);
await installPaint(page);
// a colour that fades after a look is applied would be measured half-way between the two
await page.addStyleTag({
  content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
});

const apply = (mode: string, cls: string, board: string) =>
  page.evaluate(
    ([dark, theme, bg]) => {
      const b = document.body;
      b.classList.toggle('dark', dark === 'dark');
      for (const c of [...b.classList].filter(x => x.startsWith('theme-'))) b.classList.remove(c);
      if (theme) b.classList.add(theme);
      b.style.setProperty('--board', bg ?? '');
    },
    [mode, cls, board],
  );

type Kinds = [kind: string, selector: string][];

// the contrast of the first word of each kind inside `root`, against the root's own fill and each tint between it and the
// word (the command that is selected sits on a tint over the menu)
const contrasts = (root: string, kinds: Kinds) =>
  page.evaluate(
    ([rootSelector, kindList]) => {
      const box = document.querySelector(rootSelector);
      if (!(box instanceof HTMLElement)) return [];
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (c: number[]) => 0.2126 * lin(c[0] ?? 0) + 0.7152 * lin(c[1] ?? 0) + 0.0722 * lin(c[2] ?? 0);
      const over = (top: number[], under: number[]): [number, number, number, number] => {
        const a = top[3] ?? 1,
          mix = (i: number) => (top[i] ?? 0) * a + (under[i] ?? 0) * (1 - a);
        return [mix(0), mix(1), mix(2), 1];
      };
      const behind = (el: Element) => {
        let seen = window.__paint(getComputedStyle(box).backgroundColor);
        const chain: Element[] = [];
        for (let e: Element | null = el; e && e !== box; e = e.parentElement) chain.unshift(e);
        for (const e of chain) seen = over(window.__paint(getComputedStyle(e).backgroundColor), seen);
        return seen;
      };
      const ratio = (el: Element) => {
        const bg = behind(el),
          fg = over(window.__paint(getComputedStyle(el).color), bg),
          [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
      };
      return kindList.flatMap(([kind, selector]) =>
        [...document.querySelectorAll(selector)].slice(0, 1).map(el => ({ kind, ratio: ratio(el) })),
      );
    },
    [root, kinds] as const,
  );

const problems: string[] = [];
// every look, with what is on screen held up to what it needs: the words that carry the meaning hold the 4.5 of body
// text, and the secondary ones the 3 that themeAudit holds every piece of text to
async function inEveryLook(what: string, root: string, kinds: Kinds, needs: Record<string, number>) {
  for (const t of THEMES) {
    const theme = t.id.replace(/-(light|dark)$/, '');
    await apply(t.mode, theme === 'default' ? '' : `theme-${theme}`, t.tokens.bg);
    await still(page);
    const found = await contrasts(root, kinds);
    assert.strictEqual(found.length, kinds.length, `${what}, ${t.id}: every kind of word showed`);
    for (const { kind, ratio } of found) {
      const need = needs[kind] ?? 3;
      if (ratio < need) problems.push(`${what}, ${t.id}: a ${kind} is ${ratio.toFixed(2)}:1, under ${need}:1`);
    }
  }
}

// the slash menu. Its descriptions are left out: they are --ink-faint, which #251 keeps for decoration, and it is under
// 3:1 in Default light too.
await openChat();
await page.fill('#mcInput', '/');
await page.waitForFunction(() => !!document.querySelector('.slash-menu:not([hidden]) button'));
assert.ok(await menuShown(), 'typing / opens the menu');
await still(page);
await inEveryLook(
  'the slash menu',
  '.slash-menu',
  [
    ['name', '.slash-menu button:not(.on) b'],
    ['selected name', '.slash-menu button.on b'],
    ['group', '.slash-menu .slash-group'],
  ],
  { name: 4.5, 'selected name': 4.5, group: 3 },
);
await page.fill('#mcInput', '');

// the dialog every showDialog opens, here the one that saves a template
await page.evaluate(() => {
  void window.__fenmyr.saveWithDialog(null);
});
await page.waitForSelector('.tdlg h3');
await still(page);
await inEveryLook(
  'the dialog',
  '.tdlg',
  [
    ['title', '.tdlg h3'],
    ['label', '.tdlg label'],
    ['field', '.tdlg input'],
  ],
  { title: 4.5, label: 3, field: 4.5 },
);
await l.close();
assert.deepStrictEqual(problems, [], 'the slash menu and the dialog read in every look');
console.log('POPUP CONTRAST OK');
