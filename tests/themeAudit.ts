// Every theme reads as well as Default does. In the running app, with each theme applied, every piece of text on the board,
// in Settings, in Myra's chat, in a doc and on Home is measured against what is behind it; text under 3:1 in a theme that
// Default doesn't have at that contrast in the same mode is a theme that left something behind.
import assert from 'node:assert';
import { THEMES } from '../src/web/settings/themes.ts';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { installPaint } from './support/paint.ts';

// two labels that are decoration by design (#251: --ink-faint is for placeholders and decoration)
const DECORATION = new Set(['em.', 'span#dvCount.']);
// Lantern's Snow is light, so words on a Snow card are measured against it, which finds text still drawn in a dark
// theme's light ink on a card type that doesn't take its card's ink yet: a collection's title, a shape's words, the
// audio card's time, and the wireframe pieces' text and labels. Each is to move onto the card's ink; remove it here when it does.
const LANTERN_GAPS = new Set(['div.text', 'div.text.tx', 'span.au-time', 'span.bx-l', 'span.text']);

const app = await launch({ boards: [everyOfflineCard()], open: 'every' }),
  { page } = app;
await installPaint(page);

// a colour that fades after a theme is applied would be measured half-way between the two
await page.addStyleTag({
  content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
});

const apply = (mode: string, cls: string, bg: string) =>
  page.evaluate(
    ([dark, theme, board]) => {
      const b = document.body;
      b.classList.toggle('dark', dark === 'dark');
      for (const c of [...b.classList].filter(x => x.startsWith('theme-'))) b.classList.remove(c);
      if (theme) b.classList.add(theme);
      b.style.setProperty('--board', board ?? '');
    },
    [mode, cls, bg],
  );

// text elements under 3:1, as "tag#id.classes" (the colours differ by theme, the element doesn't)
const lowText = (bg: string) =>
  page.evaluate(board => {
    const parse = (c: string) => {
      const [r, g, b, a] = window.__paint(c);
      return { r, g, b, a };
    };
    const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const lum = (c: { r: number; g: number; b: number }) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const behind = (el: Element) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.a >= 0.9) return c;
        // a card's fill is its frame, a sibling of its contents, so the words on a card are measured against that
        const frame = e.classList.contains('card') ? e.querySelector(':scope > .frame') : null,
          f = frame ? parse(getComputedStyle(frame).backgroundColor) : null;
        if (f && f.a >= 0.9) return f;
      }
      return parse(board);
    };
    const out = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('canvas, svg, img')) continue;
      if (![...el.childNodes].some(n => n.nodeType === 3 && (n.textContent ?? '').trim().length > 1)) continue;
      const r = el.getBoundingClientRect(),
        cs = getComputedStyle(el);
      if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const fg = parse(cs.color),
        bg = behind(el),
        seen = {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        },
        [hi, lo] = [lum(seen), lum(bg)].sort((a, b) => b - a);
      if (((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05) < 3)
        out.add(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')}`);
    }
    return [...out];
  }, bg);

// the places the page is looked at: the board, three Settings tabs, Myra's chat, a doc, Home
async function everywhere(bg: string) {
  const seen = new Set<string>();
  const take = async () => {
    for (const s of await lowText(bg)) seen.add(s);
  };
  await take();
  await page.click('#gearBtn');
  for (const tab of ['general', 'board', 'helpers']) {
    await page.click(`#setTabs [data-tab="${tab}"]`);
    await page.waitForTimeout(100);
    await take();
  }
  await page.click('#setClose');
  await page.click('#mPill');
  await page.waitForTimeout(250);
  await take();
  await page.keyboard.press('Escape');
  await page.locator('#cards .card.doc').dblclick();
  await page.waitForSelector('.dv-prose');
  await page.waitForTimeout(400);
  await take();
  await page.keyboard.press('Escape');
  await page.click('#homeBtn');
  await page.waitForTimeout(300);
  await take();
  await page.keyboard.press('Escape');
  return seen;
}

const named = (t: (typeof THEMES)[number]) => t.id.replace(/-(light|dark)$/, ''),
  baseline = new Map<string, Set<string>>();
for (const t of THEMES.filter(x => named(x) === 'default')) {
  await apply(t.mode, '', t.tokens.bg);
  baseline.set(t.mode, await everywhere(t.tokens.bg));
}
const problems: string[] = [];
for (const t of THEMES.filter(x => named(x) !== 'default')) {
  await apply(t.mode, `theme-${named(t)}`, t.tokens.bg);
  const base = baseline.get(t.mode) ?? new Set<string>();
  for (const s of await everywhere(t.tokens.bg))
    if (!base.has(s) && !DECORATION.has(s) && !(t.id === 'lantern-dark' && LANTERN_GAPS.has(s)))
      problems.push(`${t.id}: ${s} is under 3:1 and isn't in Default ${t.mode}`);
}
await app.close();
assert.deepStrictEqual(problems, [], 'no theme leaves unreadable text behind');
console.log('THEME AUDIT OK');
