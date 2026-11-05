// Rich notes in the real app: formatting pasted into a note or onto the board is kept through redraw, save and reopen,
// while notes saved before it, plain clipboards and Ctrl+Shift+V stay exactly as they were.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { launch } from './support/launch.ts';

const OLD_TEXT = '- not a list\n**not bold** & <b>2 * 3</b>';
const old = { id: 'old', type: 'note', x: -300, y: 0, w: 220, h: 140, r: 0, color: 'butter', text: OLD_TEXT };
const board = { id: 'rich', name: 'Rich notes', cards: [old], links: [], tray: [], view: { x: 160, y: 140, z: 1 } };
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-rich-'));
const SHOPPING = 'Shopping:\n- milk **full fat**\n- eggs\n  - free range';

const putClip = (page: Page, html: string | null, plain: string) =>
  page.evaluate(
    async ([html, plain]) => {
      const items: Record<string, Blob> = { 'text/plain': new Blob([plain], { type: 'text/plain' }) };
      if (html !== null) items['text/html'] = new Blob([html], { type: 'text/html' });
      await navigator.clipboard.write([new ClipboardItem(items)]);
    },
    [html, plain] as const,
  );
const paste = async (page: Page, html: string | null, plain: string, keys = 'Control+v') => {
  await putClip(page, html, plain);
  await page.keyboard.press(keys);
  await page.waitForTimeout(150);
};
const newNote = async (page: Page, cardsAcross: number, cardsDown: number) => {
  const id = await page.evaluate(([x, y]) => window.__fenmyr.newNote(x, y), [
    cardsAcross * 260,
    cardsDown * 200,
  ] as const);
  await page.waitForTimeout(150);
  return id;
};
const editBody = async (page: Page, id: string) => {
  await page.locator(`#cards [data-id="${id}"] .text`).dblclick();
  await page.keyboard.press('Control+End');
  await page.waitForTimeout(150);
};
const stopEditing = async (page: Page) => {
  await page.mouse.click(720, 120);
  await page.waitForTimeout(150);
};
const redraw = async (page: Page) => {
  await page.evaluate(() => window.__fenmyr.renderAll());
  await page.waitForTimeout(100);
};
const note = (page: Page, id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.board.cards.find(c => c.id === id),
      el = document.querySelector(`#cards [data-id="${id}"]`),
      body = el?.querySelector('.text'),
      bottom = (e: Element | null | undefined) => e?.getBoundingClientRect().bottom ?? 0;
    return {
      text: c?.text,
      rich: c?.type === 'note' ? c.rich : undefined,
      tags: c?.tags ?? [],
      html: body?.innerHTML ?? '',
      items: body?.querySelectorAll('li').length ?? 0,
      nested: body?.querySelectorAll(':is(ul, ol) :is(ul, ol) li').length ?? 0,
      bold: [...(body?.querySelectorAll('strong') ?? [])].map(b => b.textContent).join('|'),
      fits: bottom(body) <= bottom(el?.querySelector('.body')),
    };
  }, id);
const stored = async (page: Page, id: string) => {
  const n = await note(page, id);
  return { text: n.text, rich: n.rich };
};
const notes = (page: Page) =>
  page.evaluate(() => window.__fenmyr.board.cards.filter(c => c.type === 'note').map(c => c.id));
const count = (page: Page, type: string) =>
  page.evaluate(type => window.__fenmyr.board.cards.filter(c => c.type === type).length, type);

let l = await launch({ boards: [board], open: 'rich', data });
let { page } = l;

const before = await note(page, 'old');
assert.strictEqual(
  before.html,
  '- not a list\n**not bold** &amp; &lt;b&gt;2 * 3&lt;/b&gt;',
  'a note saved before rich text shows its characters as they are',
);
assert.strictEqual(before.rich, undefined, 'and is not made rich');

const shopping = await newNote(page, -2, -1);
await page.keyboard.type('Shopping:');
await paste(
  page,
  '<meta charset="utf-8"><ul><li>milk <b>full fat</b></li><li>eggs<ul><li>free range</li></ul></li></ul>',
  'milk full fat\neggs\nfree range',
);
assert.deepStrictEqual(await stored(page, shopping), { text: SHOPPING, rich: true }, 'a pasted list makes a rich note');
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
assert.strictEqual((await note(page, shopping)).text, 'Shopping:', 'undo takes the paste back out');
await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(150);
assert.strictEqual((await note(page, shopping)).text, SHOPPING, 'and redo puts it back');
await stopEditing(page);
await redraw(page);
let n = await note(page, shopping);
assert.deepStrictEqual(
  [n.items, n.nested, n.bold, n.fits],
  [3, 1, 'full fat', true],
  'after a redraw the list, its nesting and its bold are drawn, and the note fits them',
);

await page.keyboard.press('Control+f');
await page.keyboard.type('fat');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
assert.strictEqual(await page.locator('#fbCount').textContent(), '1 of 1', 'find finds a word inside bold');
await page.keyboard.press('Escape');
await stopEditing(page);

await editBody(page, shopping);
await page.keyboard.type(' #urgent ');
await stopEditing(page);
n = await note(page, shopping);
assert.ok(
  n.rich && n.text?.startsWith(SHOPPING) && !n.text.includes('#') && n.tags.includes('urgent') && n.items === 3,
  `picking a tag in a rich note keeps its formatting: ${JSON.stringify(n)}`,
);
const shoppingNow = n.text;

await page.evaluate(id => window.__fenmyr.selectOnly([id]), shopping);
assert.strictEqual(
  await page.evaluate(() => window.__fenmyr.copyCards()?.text),
  'Shopping:\n• milk full fat\n• eggs\n  • free range ',
  'copied cards put the words on the clipboard without markers',
);
await page.keyboard.press('Control+d');
await page.waitForTimeout(200);
const copy = await page.evaluate(() => window.__fenmyr.sel[0] ?? '');
assert.notStrictEqual(copy, shopping, 'Ctrl+D makes a copy');
assert.deepStrictEqual(await stored(page, copy), { text: shoppingNow, rich: true }, 'that keeps the formatting');
await stopEditing(page);

const notesBefore = (await notes(page)).length;
await paste(page, '<p>Plan for <b>Friday</b></p><ol start="3"><li>pack</li><li><i>leave</i></li></ol>', 'x');
assert.strictEqual((await notes(page)).length, notesBefore + 1, 'formatted text pasted on the board makes a note');
assert.deepStrictEqual(
  await stored(page, (await notes(page)).at(-1) ?? ''),
  { text: 'Plan for **Friday**\n\n3. pack\n4. *leave*', rich: true },
  'a rich one, with its bold, italic and numbers kept',
);
await stopEditing(page);
await paste(page, null, 'Call the plumber at 3');
assert.deepStrictEqual(
  await stored(page, (await notes(page)).at(-1) ?? ''),
  { text: 'Call the plumber at 3', rich: undefined },
  'plain words pasted on the board make a plain note, as before',
);
await stopEditing(page);
const links = await count(page, 'link');
await paste(page, null, 'https://example.invalid/page');
assert.deepStrictEqual(
  [await count(page, 'link'), (await notes(page)).length],
  [links + 1, notesBefore + 2],
  'an address pasted on the board still makes a link card',
);
await stopEditing(page);

const md = await newNote(page, 1, -1);
await paste(page, null, '## Trip\n- [ ] book **train**\n- [x] pack\n  - *socks*\n1. go');
assert.deepStrictEqual(
  await stored(page, md),
  { text: '**Trip**\n- ☐ book **train**\n- ☑ pack\n  - *socks*\n1. go', rich: true },
  'Markdown on the clipboard becomes formatting',
);
await paste(page, '<b>x</b>', ' **x**', 'Control+Shift+v');
await stopEditing(page);
await redraw(page);
n = await note(page, md);
assert.ok(
  n.text?.endsWith('1. go \\*\\*x\\*\\*') && n.html.endsWith('<li>go **x**</li></ol>'),
  `Ctrl+Shift+V into a rich note pastes the words without turning them into formatting: ${n.text}`,
);

const pdf = await newNote(page, -1, 1);
await paste(page, null, 'Packing\n• Tent\n• Stove\n1) Book\n2) Go');
assert.strictEqual(
  (await note(page, pdf)).text,
  'Packing\n- Tent\n- Stove\n1. Book\n2. Go',
  'PDF bullets become a list',
);
await stopEditing(page);

const linked = await newNote(page, 0, 1);
await paste(page, '<p>See <a href="https://example.com/a">the page</a></p>', 'See the page');
assert.deepStrictEqual(
  await stored(page, linked),
  { text: 'See the page (https://example.com/a)', rich: undefined },
  'a link with no formatting pastes as plain words that keep its address',
);
await stopEditing(page);

const plain = await newNote(page, 1, 1);
await paste(page, '<ul><li>a</li><li><b>b</b></li></ul>', '- a\n- **b**', 'Control+Shift+v');
assert.deepStrictEqual(
  await stored(page, plain),
  { text: '- a\n- **b**', rich: undefined },
  'Ctrl+Shift+V into a plain note pastes the words as they are',
);
await stopEditing(page);
const menu = await newNote(page, 2, -1);
await putClip(page, null, '- one\n- two');
await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.paste());
await page.waitForTimeout(150);
assert.deepStrictEqual(
  await stored(page, menu),
  { text: '- one\n- two', rich: true },
  'a paste from the Edit menu after Ctrl+Shift+V converts again',
);
await stopEditing(page);

const long = await newNote(page, 2, 1);
await paste(page, null, 'word '.repeat(12_000));
const kept = (await note(page, long)).text ?? '';
assert.ok(kept.length <= 50_000 && kept.length > 49_990 && kept.endsWith('word'), 'a long paste stops at a word');
assert.ok(
  await page.evaluate(
    () => !!document.querySelector('#mBubble.on') && /50,000/.test(document.getElementById('mSay')?.textContent ?? ''),
  ),
  'and says so',
);
await stopEditing(page);

await page.waitForFunction(() => document.getElementById('saved')?.textContent?.toLowerCase() === 'saved');
assert.deepStrictEqual(l.errors, []);
await l.close();
l = await launch({ data, open: 'rich' });
page = l.page;
n = await note(page, shopping);
assert.deepStrictEqual(
  [n.text, n.rich, n.items, n.bold],
  [shoppingNow, true, 3, 'full fat'],
  'reopened, the list is still there',
);
const file: unknown = JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'rich.json'), 'utf8'));
const saved = typeof file === 'object' && file && 'cards' in file && Array.isArray(file.cards) ? file.cards : [];
assert.deepStrictEqual(
  saved.find(c => c.id === 'old'),
  old,
  'a note saved before rich text is saved back unchanged',
);
assert.strictEqual((await note(page, 'old')).html, before.html, 'and still looks the same');
assert.deepStrictEqual(l.errors, []);
await l.close();
fs.rmSync(data, { recursive: true, force: true });
console.log('RICH NOTES OK');
