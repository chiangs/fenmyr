// A wire of both is kept whole, with its style, by every path that carries a wire: a save and a reload, undo and redo
// (a change and a delete), an Alt-drag copy, copy and paste and a paste of the copy read back after a reload, a template
// of its cards as saved and as used, Duplicate on its board, and a zip out and in.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openZip } from '../src/shared/fenmyrZip.ts';
import type { Link } from '../src/shared/model.ts';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';
import { BOTH, BOTH_STYLE, check, style, wireKit, wiresBoard, wiresIn } from './support/wireKit.ts';
import { dialogsAnswer, rec } from './support/zipKit.ts';
import { exportRow, importFromHome, readBoards, saidSaved } from './support/zipUi.ts';

const l = await launch({ boards: [wiresBoard], open: 'wires' });
const { page } = l;
const { board, links, link, ids, open, select, heads } = wireKit(page);

const picked = async (how: 'none' | 'end' | 'both') => {
  await page.click('#selbar [data-pop="warr"]');
  await page.click(`#selbar [data-wb="arrow:${how}"]`);
  await still(page);
};
// every wire of both on the board, as it stands: the one the board began with, and any a path made
const bothWires = async (except: ReadonlySet<string> = new Set()) =>
  (await links()).filter(x => x.arrow === 'both' && !except.has(x.id));
const flush = () => page.evaluate(() => window.Fenmyr.save(window.__fenmyr.curBoard()).then(() => {}));
const reload = async () => {
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await still(page);
};

await check('a wire of both survives a save and a reload', async () => {
  await flush();
  const disk = readBoards(l.data).find(b => b.id === 'wires');
  assert.deepStrictEqual(
    wiresIn(disk?.links).find(x => x.id === 'wb'),
    BOTH,
    'the file holds the wire whole',
  );
  await reload();
  assert.deepStrictEqual(await link('wb'), BOTH, 'it comes back whole');
  assert.deepStrictEqual(await heads('wb'), ['start', 'end'], 'with its two heads');
  assert.deepStrictEqual(await link('wf'), { id: 'wf', a: 'D', b: 'B', arrow: false }, 'and a wire of false as it was');
});

await check('undo and redo keep a wire of both, one changed and one deleted', async () => {
  await select('wb');
  await still(page);
  await picked('none');
  assert.strictEqual((await link('wb'))?.arrow, undefined, 'none took the arrow off');
  await page.keyboard.press('Control+z');
  await still(page);
  assert.deepStrictEqual(await link('wb'), BOTH, 'undo puts both back');
  assert.deepStrictEqual(await heads('wb'), ['start', 'end'], 'with two heads');
  await page.keyboard.press('Control+Shift+z');
  await still(page);
  assert.strictEqual((await link('wb'))?.arrow, undefined, 'redo takes it off again');
  await page.keyboard.press('Control+z');
  await still(page);
  await select('wb');
  await page.keyboard.press('Delete');
  await still(page);
  assert.strictEqual(await link('wb'), undefined, 'Delete removes the wire');
  await page.keyboard.press('Control+z');
  await still(page);
  assert.deepStrictEqual(await link('wb'), BOTH, 'and undo brings it back whole');
  await page.keyboard.press('Control+Shift+z');
  await still(page);
  assert.strictEqual(await link('wb'), undefined, 'redo deletes it again');
  await page.keyboard.press('Control+z');
  await still(page);
  assert.deepStrictEqual(await link('wb'), BOTH, 'and a last undo leaves it as it began');
});

// the wires a path made, whichever cards they join: new ids, the style and both heads kept
const madeBy = async (how: string, path: () => Promise<void>) => {
  const had = await ids();
  await path();
  await still(page);
  const made = await bothWires(had);
  assert.strictEqual(made.length, 1, `${how} makes one wire of both, not ${made.length}`);
  return made[0];
};
const copied = (w: Link | undefined) => {
  assert(w, 'there is a copy');
  assert.deepStrictEqual(style(w), BOTH_STYLE, 'it keeps its style and both ends’ arrowheads');
  assert(!['A', 'B'].includes(w.a) && !['A', 'B'].includes(w.b), 'between the copies, not the originals');
};

await check('a wire of both is kept by an Alt-drag copy of its two cards', async () => {
  await page.evaluate(() => window.__fenmyr.selectOnly(['A', 'B']));
  const at = await rect(page, '#cards .card[data-id="A"]');
  copied(
    await madeBy('an Alt-drag copy', async () => {
      await page.keyboard.down('Alt');
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.down();
      await page.mouse.move(at.x + at.width / 2 + 60, at.y + at.height / 2 + 140, { steps: 6 });
      await page.mouse.up();
      await page.keyboard.up('Alt');
    }),
  );
});

await check('a wire of both is kept by copy and paste, and by a paste of a copy read back after a reload', async () => {
  await page.evaluate(() => window.__fenmyr.selectOnly(['A', 'B']));
  copied(
    await madeBy('a paste', () =>
      page.evaluate(() => {
        window.__fenmyr.copyCards();
        window.__fenmyr.pasteCards();
      }),
    ),
  );
  await flush();
  await reload();
  copied(await madeBy('a paste after a reload', () => page.evaluate(() => window.__fenmyr.pasteCards())));
});

await check('a wire of both is kept by a template of its cards, as saved and as used', async () => {
  const template = await page.evaluate(() =>
    window.__fenmyr.saveAsTemplate('Both ways', ['A', 'B'], { desc: '', mode: 'add' }),
  );
  assert(template, 'the template is saved');
  assert.deepStrictEqual(wiresIn(template.links).map(style), [BOTH_STYLE], 'it holds the wire, as it was on the board');
  const stored = await page.evaluate(async () => (await window.Fenmyr.templates()).find(t => t.name === 'Both ways'));
  assert.deepStrictEqual(wiresIn(stored?.links).map(style), [BOTH_STYLE], 'and the host keeps it so');
  copied(
    await madeBy('using the template', () =>
      page.evaluate(t => window.__fenmyr.useTemplate(t, 'add').then(() => {}), template),
    ),
  );
  await page.evaluate(t => window.__fenmyr.useTemplate(t, 'new').then(() => {}), template);
  await still(page);
  assert.notStrictEqual((await board()).id, 'wires', 'a template that opens as a board makes a new one');
  assert.deepStrictEqual((await links()).map(style), [BOTH_STYLE], 'with the wire as the template held it');
  await open('wires');
});

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-wire-arrows-'));

await check('a wire of both is kept by Duplicate on its board, and by a zip out and in', async () => {
  await flush();
  await page
    .locator('#boards .board-row', { hasText: /^Wires$/ })
    .first()
    .click({ button: 'right' });
  await page.locator('#rowMenu [data-m="dup"]').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('#boards .board-row')].some(r => r.textContent?.trim() === 'Wires copy'),
  );
  const copy = readBoards(l.data).find(b => b.name === 'Wires copy');
  assert.deepStrictEqual(
    wiresIn(copy?.links).find(x => x.id === 'wb'),
    BOTH,
    'the copy of the board holds the wire whole',
  );

  const zipPath = path.join(out, 'Wires.fenmyr.zip');
  await dialogsAnswer(l.app, zipPath, null);
  const dialog = await exportRow(page, 'Wires');
  await dialog.ok();
  await saidSaved(page, 'Wires');
  const zip = openZip(new Uint8Array(fs.readFileSync(zipPath)), true);
  const inZip = rec(JSON.parse(Buffer.from(zip.json['boards/wires.json'] ?? []).toString()));
  assert.deepStrictEqual(
    wiresIn(inZip.links).find(x => x.id === 'wb'),
    BOTH,
    'the zip holds it whole',
  );
  await importFromHome(l.app, page, zipPath, 'Wires 2');
  await still(page);
  const back = readBoards(l.data).find(b => b.name === 'Wires 2');
  assert.deepStrictEqual(
    wiresIn(back?.links).find(x => x.id === 'wb'),
    BOTH,
    'and the board opened from it has it whole',
  );
});

assert.deepStrictEqual(l.errors, [], 'the page raised no errors');
await l.close();
fs.rmSync(out, { recursive: true, force: true });
console.log('WIRE ARROWS CARRY OK');
