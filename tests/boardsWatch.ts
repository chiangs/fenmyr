// The board watcher speaks up only for boards that came from outside the app. A zip Fenmyr imports itself saves its
// boards one by one, and a watcher tick between those saves once had Myra say a board of the zip "just showed up".
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { importFromHome } from './support/zipUi.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' };
const l = await launch({ boards: [{ id: 'b1', name: 'Start', cards: [note], links: [], tray: [] }], open: 'b1' });
const { page, app } = l;
// every line Myra says, not only the last
await page.evaluate(() => {
  const said: string[] = [];
  Object.assign(window, { __said: said });
  const el = document.getElementById('mSay');
  if (el)
    new MutationObserver(() => said.push(el.textContent ?? '')).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
});
const saidAll = () =>
  page.evaluate(() => ('__said' in window && Array.isArray(window.__said) ? window.__said.map(String) : []));

// each save holds the import back past the watcher's 500 ms tick, so the tick always falls between the zip's boards
await page.evaluate(() => {
  const save = Fenmyr.save.bind(Fenmyr);
  Fenmyr.save = async board => {
    const done = await save(board);
    // sleeps on purpose: the import must still be landing when the watcher's tick comes, which is the race under test
    await new Promise(r => setTimeout(r, 800));
    return done;
  };
});
await importFromHome(app, page, path.join(import.meta.dirname, 'fixtures', 'pr1-board.fenmyr.zip'), 'Roadmap');
await still(page);
const fromZip = (await saidAll()).filter(s => /just showed up/.test(s));
assert.deepStrictEqual(fromZip, [], 'nothing of the zip is said to have just shown up');

// a board copied in from outside still is
fs.writeFileSync(
  path.join(l.data, 'fenmyr', 'boards', 'outside1.json'),
  JSON.stringify({ id: 'outside1', name: 'From outside', cards: [], links: [], tray: [] }),
);
await page.waitForFunction(() =>
  /^“From outside” just showed up/.test(document.getElementById('mSay')?.textContent ?? ''),
);

assert.deepStrictEqual(l.errors, []);
console.log('BOARDS WATCH OK');
await l.close();
