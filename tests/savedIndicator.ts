// The "saved" in the top bar means the board on disk has every change. A write that was already going when a newer
// change came leaves "saving…" up when it lands, and "saved" comes with the write that has the newer change in it.
// Tests read the board file once it says "saved", so a word that came too soon made them read an old file (#541).
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './support/launch.ts';

declare global {
  interface Window {
    // the writes this test holds: how many have started and landed, and how it lets the first one go
    __writes?: { held: number; landed: number; letGo: () => void };
  }
}

const at = { r: 0 };
const card = (id: string, x: number) => ({ id, type: 'note', x, y: 100, w: 220, h: 120, ...at, text: id });
const board = {
  id: 'b',
  name: 'B',
  cards: [card('n1', 100), card('n2', 400), card('n3', 700)],
  links: [],
  tray: [],
  view: { x: 300, y: 200, z: 1 },
};
const l = await launch({ boards: [board], open: 'b' });
const { page } = l;
const onDisk = (): string[] =>
  JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', 'b.json'), 'utf8')).cards.map(
    (c: { id: string }) => c.id,
  );
const word = () => page.evaluate(() => document.getElementById('saved')?.textContent);
const remove = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.selectOnly([id]), id);
  await page.keyboard.press('Delete');
};

try {
  // the first write is held until the test lets it go, so the second change comes while it is still going
  await page.evaluate(() => {
    const save = Fenmyr.save.bind(Fenmyr);
    const w = { held: 0, landed: 0, letGo: () => {} };
    const gate = new Promise<void>(r => (w.letGo = r));
    window.__writes = w;
    Fenmyr.save = async board => {
      // the bridge copies the board when the write starts, so a held write keeps the board as it was then
      const sent = structuredClone(board);
      if (++w.held === 1) await gate;
      const done = await save(sent);
      w.landed++;
      return done;
    };
  });
  await remove('n1');
  await page.waitForFunction(() => window.__writes?.held === 1);
  await remove('n2');
  assert.strictEqual(await word(), 'saving…', 'a second change while the first is being written says saving…');
  await page.evaluate(() => window.__writes?.letGo());
  await page.waitForFunction(() => window.__writes?.landed === 1);
  assert.deepStrictEqual(onDisk(), ['n2', 'n3'], 'the first write has only the first change');
  assert.strictEqual(await word(), 'saving…', 'so when it lands the bar still says saving…');
  await page.waitForFunction(() => document.getElementById('saved')?.textContent === 'saved');
  assert.deepStrictEqual(onDisk(), ['n3'], 'and once it says saved, the file has both changes');
  console.log('SAVED INDICATOR OK');
} finally {
  await l.close();
}
