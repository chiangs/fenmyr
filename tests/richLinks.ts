// Links and typed Markdown in notes, in the real app. A typed [label](address), Ctrl+K and a pasted link become links,
// and a click opens one in the browser. Typed **word** turns bold, while prose with stars stays as typed. Each typing
// check types Q last, so the stored text also shows where the caret was left.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const GUIDE = 'https://example.org/guide';
const LINKED = {
  id: 'linked',
  type: 'note',
  x: 120,
  y: 60,
  w: 300,
  h: 140,
  r: 0,
  color: 'white',
  name: '',
  text: `Read [the guide](${GUIDE}) first`,
  rich: true,
};
const board = { id: 'links', name: 'Links', cards: [LINKED], links: [], tray: [], view: { x: 160, y: 140, z: 1 } };
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-links-'));
let l = await launch({ boards: [board], open: 'links', data });
let { page } = l;

const watchBrowser = () =>
  l.app.evaluate(({ shell }) => {
    const seen: string[] = [];
    Reflect.set(globalThis, '__opened', seen);
    shell.openExternal = async url => {
      seen.push(url);
    };
  });
const opened = () => l.app.evaluate(() => Reflect.get(globalThis, '__opened'));
const editing = () => page.evaluate(() => window.__fenmyr.editing);
const card = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.board.cards.find(c => c.id === id);
    return { x: c?.x, text: c?.type === 'note' ? c.text : undefined, rich: c?.type === 'note' ? c.rich : undefined };
  }, id);
const drawn = (id: string) =>
  page.evaluate(id => document.querySelector(`#cards [data-id="${id}"] .text`)?.innerHTML, id);
const blur = async () => {
  await page.mouse.click(1380, 860);
  await page.waitForTimeout(150);
};
const TAP_WAIT = 700;

await watchBrowser();
const link = page.locator('#cards [data-id="linked"] .text a');
await link.click();
await page.waitForTimeout(TAP_WAIT);
assert.deepStrictEqual(await opened(), [GUIDE], 'T9: a click on a link opens its address in the browser');
assert.strictEqual(await editing(), null, 'and leaves the note as it was');

await link.dblclick();
await page.waitForTimeout(TAP_WAIT);
assert.deepStrictEqual(
  [await opened(), await editing()],
  [[GUIDE], 'linked'],
  'a double-click on a link edits the note instead',
);
await link.click();
await page.keyboard.type('Q');
await page.waitForTimeout(TAP_WAIT);
assert.match((await card('linked')).text ?? '', /^Read \[the [a-z]*Q[a-z]*\]\(https:\/\/example\.org\/guide\) first$/);
assert.strictEqual((await opened()).length, 1, 'while editing, a click on a link places the caret in it');
await blur();

const box = await link.boundingBox();
const xBefore = (await card('linked')).x ?? 0;
if (box) {
  await page.mouse.move(box.x + 8, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 50, { steps: 8 });
  await page.mouse.up();
}
await page.waitForTimeout(TAP_WAIT);
assert.ok((await card('linked')).x !== xBefore, 'a note dragged by its link moves');
assert.strictEqual((await opened()).length, 1, 'without opening the link');

async function edit(text: string) {
  await page.keyboard.press('Escape');
  const id = await page.evaluate(text => {
    const f = window.__fenmyr,
      cards = f.board.cards,
      id = `n${Date.now()}`;
    for (let i = cards.length - 1; i >= 0; i--) if (cards[i]?.id !== 'linked') cards.splice(i, 1);
    cards.push({ id, type: 'note', x: 520, y: 60, w: 320, h: 160, r: 0, color: 'white', name: '', text });
    Object.assign(cards.at(-1) ?? {}, { rich: true });
    f.renderAll();
    return id;
  }, text);
  const body = page.locator(`#cards [data-id="${id}"] .text`);
  await body.click();
  await page.waitForTimeout(450);
  await body.dblclick();
  await page.waitForFunction(id => window.__fenmyr.editing === id, id);
  await page.keyboard.press('Control+End');
  return id;
}
const type = (words: string) => page.keyboard.type(words, { delay: 20 });
const selectWords = (id: string, words: string) =>
  page.evaluate(
    ([id, words]) => {
      const t = document.querySelector(`#cards [data-id="${id}"] .text`),
        walk = t && document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      for (let n = walk?.nextNode(); n; n = walk?.nextNode()) {
        const at = n.textContent?.indexOf(words) ?? -1;
        if (at >= 0) getSelection()?.setBaseAndExtent(n, at, n, at + words.length);
        if (at >= 0) return;
      }
    },
    [id, words] as const,
  );
const typedAs = async (start: string, words: string, want: string, why: string) => {
  const id = await edit(start);
  await type(`${words}Q`);
  await blur();
  assert.strictEqual((await card(id)).text, want, why);
  return id;
};

let id = await typedAs(
  'see',
  ' [the docs](https://x.org/a_(b)) now',
  'see [the docs](https://x.org/a_\\(b\\)) nowQ',
  'T9: a typed [label](address) becomes a link, and what follows it is plain',
);
assert.match((await drawn(id)) ?? '', /<a href="https:\/\/x\.org\/a_\(b\)">the docs<\/a>/, 'drawn as a link');
await typedAs(
  'one',
  ' **bold** *it* ~~gone~~ end',
  'one **bold** *it* ~~gone~~ endQ',
  'T10: typed **word**, *word* and ~~word~~ turn bold, italic and struck, and the words after them stay plain',
);
await typedAs(
  'sum',
  ' 5 * 3 * 2, snake_case, 2*3*4, a ** b ** and [x](javascript:go)',
  'sum 5 \\* 3 \\* 2, snake_case, 2\\*3\\*4, a \\*\\* b \\*\\* and \\[x](javascript:go)Q',
  'prose with stars and underscores, and a link to a script, stay as typed',
);

id = await edit('start');
await type(' **word**');
await page.keyboard.press('Control+z');
await type('Q');
await blur();
assert.strictEqual((await card(id)).text, 'start \\*\\*word\\*\\*Q', 'T10: one Ctrl+Z gives back the typed stars');

id = await edit('one');
await page.keyboard.press('Control+b');
await type(' two');
await blur();
assert.strictEqual((await card(id)).text, 'one **two**', 'Ctrl+B with no words selected still bolds after a space');

const linkBox = () => page.evaluate(() => document.querySelector('.note-link input')?.getAttribute('value'));
id = await edit('one two three');
await selectWords(id, 'two');
await page.keyboard.press('Control+k');
await page.waitForSelector('.note-link input');
assert.strictEqual(await linkBox(), '', 'T9: Ctrl+K opens a box for the address of the selected words');
assert.ok(
  !(await page.evaluate(() => document.getElementById('capture')?.classList.contains('on'))),
  'instead of quick capture',
);
await type('example.com/two');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
assert.strictEqual(await editing(), id, 'Enter links them and goes back to the note');
await page.keyboard.press('End');
await type(' and ');
await page.keyboard.press('Control+k');
await type('me@example.com');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
await selectWords(id, 'two');
await page.keyboard.press('Control+k');
await page.waitForSelector('.note-link input');
assert.strictEqual(await linkBox(), 'https://example.com/two', 'Ctrl+K in a link shows its address');
await page.keyboard.press('Escape');
await page.keyboard.press('End');
await type('Q');
await blur();
assert.strictEqual(
  (await card(id)).text,
  'one [two](https://example.com/two) three and [me@example.com](mailto:me@example.com)Q',
  'a bare domain gets https://, an email address mailto:, with no words selected the address is the label, and Escape changes nothing',
);
id = await edit('one [two](https://example.com/two) three');
await selectWords(id, 'two');
await page.keyboard.press('Control+k');
await page.locator('.note-link [data-link="remove"]').click();
await type('Q');
await blur();
assert.strictEqual((await card(id)).text, 'one Q three', 'Remove link keeps the words without the link');
await page.keyboard.press('Control+k');
await page.waitForTimeout(150);
assert.ok(
  await page.evaluate(() => document.getElementById('capture')?.classList.contains('on')),
  'outside a note, Ctrl+K is still quick capture',
);
await page.keyboard.press('Escape');

id = await edit('');
await page.evaluate(async () => {
  const html = '<p>See <a href="https://example.com/a">the page</a></p>';
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob(['See the page'], { type: 'text/plain' }),
    }),
  ]);
});
await page.keyboard.press('Control+v');
await page.waitForTimeout(150);
await blur();
const pasted = 'See [the page](https://example.com/a)',
  kept = await card(id);
assert.deepStrictEqual([kept.text, kept.rich], [pasted, true], 'a pasted link is kept');
await page.waitForFunction(() => document.getElementById('saved')?.textContent?.toLowerCase() === 'saved');
assert.deepStrictEqual(l.errors, []);
await l.close();

l = await launch({ data, open: 'links' });
page = l.page;
await watchBrowser();
assert.strictEqual((await card(id)).text, pasted, 'reopened, the pasted link is still there');
const reopened = page.locator(`#cards [data-id="${id}"] .text a`);
assert.strictEqual(await reopened.getAttribute('href'), 'https://example.com/a', 'and drawn as a link');
await reopened.click();
await page.waitForTimeout(TAP_WAIT);
assert.deepStrictEqual(await opened(), ['https://example.com/a'], 'that a click opens');
assert.deepStrictEqual(l.errors, []);
await l.close();
fs.rmSync(data, { recursive: true, force: true });
console.log('RICH LINKS OK');
