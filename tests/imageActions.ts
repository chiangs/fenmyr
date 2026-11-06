// An image card's right-click actions in the real app: download, copy for other apps, and replace from a file or the clipboard.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

// a 4×2 picture and a 2×4 one, so a replacement visibly changes the card's shape
const wide =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGP4sMELjhiQOQDMWg9Rvmzn5AAAAABJRU5ErkJggg==';
const tall =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAAECAIAAAArjXluAAAAEElEQVR4nGPIX3wNiBiwUQDSZA9BwZHg4gAAAABJRU5ErkJggg==';
const pic = {
  id: 'pic',
  type: 'image',
  x: 300,
  y: 200,
  w: 260,
  h: 146,
  r: 0,
  src: wide,
  crop: { x: 0, y: 0, w: 0.5, h: 1 },
};
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-img-'));
const l = await launch({ boards: [{ id: 'b', name: 'Pictures', cards: [pic], links: [], tray: [] }], open: 'b' });
const { page, app } = l;

const card = () =>
  page.evaluate(() => {
    const c = window.__fenmyr.board.cards.find(x => x.id === 'pic');
    return c?.type === 'image' ? { src: c.src, w: c.w, h: c.h, crop: !!c.crop } : null;
  });
const menu = async () => {
  await page.locator('#cards [data-id="pic"]').click({ button: 'right' });
  return page.locator('#rowMenu button').allTextContents();
};
const choose = async (label: string) => {
  await menu();
  await page.locator('#rowMenu button', { hasText: label }).click();
  await page.waitForTimeout(400);
};

const items = await menu();
for (const label of ['Download image…', 'Copy image', 'Replace with a file…', 'Replace with the copied picture'])
  assert.ok(items.includes(label), `the menu offers "${label}"`);
await page.keyboard.press('Escape');

await app.evaluate(
  ({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  },
  path.join(out, 'saved.png'),
);
await choose('Download image…');
const saved = fs.readFileSync(path.join(out, 'saved.png'));
assert.strictEqual(saved.subarray(1, 4).toString(), 'PNG', 'Download saves the picture itself');

await app.evaluate(({ clipboard }) => clipboard.clear());
await choose('Copy image');
// Electron's clipboard reads and writes like the browser's: items holding a Blob per type
const copied = await app.evaluate(async ({ clipboard, nativeImage }) => {
  for (const item of await clipboard.read()) {
    if (!item.types.includes('image/png')) continue;
    const png = await item.getType('image/png');
    return png instanceof Blob ? nativeImage.createFromBuffer(Buffer.from(await png.arrayBuffer())).getSize() : null;
  }
  return null;
});
assert.deepStrictEqual(copied, { width: 4, height: 2 }, 'Copy image puts the picture on the clipboard');

await app.evaluate(async ({ clipboard, ClipboardItem }, src) => {
  const png = new Blob([Buffer.from(src.split(',')[1] ?? '', 'base64')], { type: 'image/png' });
  await clipboard.write([new ClipboardItem({ 'image/png': png })]);
}, tall);
await choose('Replace with the copied picture');
const fromClip = await card();
assert.notStrictEqual(fromClip?.src, wide, 'the copied picture replaces the old one');
assert.deepStrictEqual(
  { w: fromClip?.w, h: fromClip?.h, crop: fromClip?.crop },
  { w: 260, h: 536, crop: false },
  'the card keeps its width, takes the new shape, and drops the old crop',
);

await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
assert.strictEqual((await card())?.src, wide, 'one undo brings the old picture back');

await app.evaluate(({ clipboard }) => clipboard.writeText('just words'));
await choose('Replace with the copied picture');
assert.strictEqual((await card())?.src, wide, 'with no picture on the clipboard, nothing changes');

const file = path.join(out, 'tall.png');
fs.writeFileSync(file, Buffer.from(tall.split(',')[1] ?? '', 'base64'));
const chooser = page.waitForEvent('filechooser');
await menu();
await page.locator('#rowMenu button', { hasText: 'Replace with a file…' }).click();
await (await chooser).setFiles(file);
await page.waitForTimeout(400);
assert.strictEqual((await card())?.h, 536, 'a picked file replaces the picture');

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
console.log('IMAGE ACTIONS OK');
