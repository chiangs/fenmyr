// A prototype made before it came with rules and design cards is offered them once, after a build: Myra says so under
// the build with Add them and Not now. Add them puts the two cards where there is room, selects them and saves; Not now
// adds none. Neither, nor a second build, nor a build on a board that has them, brings the offer back.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { Card } from '../src/shared/model.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { overlaps, roleDocs } from './support/guides.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';

const { work, repo } = freshRepo('fenmyr-guide-offer-');
const l = await launch({ claude: true });
const standIn = buildStandIn(l);
const { page } = l;

const boardFile = (id: string): { cards: Record<string, unknown>[] } =>
  JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', `${id}.json`), 'utf8'));
const cardsOf = (): Promise<Card[]> => page.evaluate(() => window.__fenmyr.curBoard()?.cards ?? []);
// the board is written once Fenmyr says so, so a file is read only after this
const saved = () =>
  page.waitForFunction(() => document.getElementById('saved')?.textContent === 'saved', undefined, { polling: 50 });
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await page.waitForFunction(id => window.__fenmyr.curBoard()?.id === id, id);
};
const says = (text: string) =>
  page.waitForFunction(
    t => [...document.querySelectorAll('#mcList .mc-msg')].some(m => m.textContent?.includes(t)),
    text,
    { polling: 100 },
  );
const OFFER = 'I can keep rules and design just for this prototype, on top of the repo’s. Shall I add the two cards?';
// each line of the offer in the open chat, with the buttons under it
const offers = () =>
  page.evaluate(
    t =>
      [...document.querySelectorAll('#mcList .mc-msg')]
        .filter(m => m.firstChild?.textContent === t)
        .map(m =>
          [...m.querySelectorAll('.m-acts button')].map(
            b => `${b.textContent}${b.classList.contains('ghost') ? ' (ghost)' : ''}`,
          ),
        ),
    OFFER,
  );
const build = async (request: string, built: string) => {
  standIn.next({ files: { 'src/App.tsx': `export const App = () => <h1>${built}</h1>;\n` }, reply: built });
  await page.evaluate(r => window.__fenmyr.applyMyra({ say: 'On it.', build: { request: r } }, r), request);
  await says(built);
};
const remembered = (): Promise<unknown> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('fenmyr:guidesOffered') ?? '[]'));
const tap = (label: string) =>
  page.locator('#mcList .mc-msg', { hasText: OFFER }).getByRole('button', { name: label }).click();

try {
  await page.evaluate(
    async ({ repo }) => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
        folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
        order: {},
      });
      // three prototypes with nine notes around the middle of the view, so the new cards have to find room; one of
      // them already has the two docs of its own
      for (const [id, name] of [
        ['old', 'Receipt'],
        ['older', 'Basket'],
        ['has', 'Checkout'],
      ] as const) {
        const proto = await window.Fenmyr.protoCreate({ root: repo, name, stack: 'react' });
        const notes: Card[] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
          id: `${id}-n${n}`,
          type: 'note',
          x: ((n % 3) - 1) * 300,
          y: (Math.floor(n / 3) - 1) * 220,
          w: 220,
          h: 140,
          text: `Note ${n}`,
        }));
        const own: Card[] = [
          { id: `${id}-r`, type: 'doc', x: 0, y: -400, w: 240, h: 52, text: 'Our rules', role: 'rules' },
          { id: `${id}-d`, type: 'doc', x: 300, y: -400, w: 240, h: 52, text: 'Our design', role: 'design' },
        ];
        await window.Fenmyr.save({
          id,
          name,
          folder: 'pf',
          kind: 'prototype',
          proto,
          cards: id === 'has' ? [...notes, ...own] : notes,
          links: [],
          tray: [],
        });
      }
      await window.__fenmyr.refreshBoards();
    },
    { repo },
  );

  // a finished build on a board without them: Myra offers once
  await open('old');
  await build('Build it.', 'First built.');
  await says(OFFER);
  assert.deepStrictEqual(
    await offers(),
    [['Add them', 'Not now (ghost)']],
    'after the build she offers, with Add them and Not now',
  );
  assert.deepStrictEqual(await remembered(), ['old'], 'and remembers the board');
  await build('Build it again.', 'Second built.');
  await still(page);
  assert.strictEqual((await offers()).length, 1, 'a second build doesn’t offer again');
  assert.strictEqual(roleDocs(await cardsOf()).length, 0, 'and nothing was added to the board');

  // Add them: two cards where there is room, selected, saved
  await tap('Add them');
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.cards.some(c => c.type === 'doc'));
  const added = await cardsOf();
  assert.deepStrictEqual(
    roleDocs(added).map(c => [c.role, c.text, c.body ?? '']),
    [
      ['rules', 'This prototype’s rules', ''],
      ['design', 'This prototype’s design', ''],
    ],
    'Add them puts the two cards on the board, empty',
  );
  assert.deepStrictEqual(overlaps(added), [], 'clear of the nine notes already there');
  assert.deepStrictEqual(
    await page.evaluate(() => window.__fenmyr.sel.toSorted()),
    roleDocs(added)
      .map(c => c.id)
      .toSorted(),
    'and selects them',
  );
  await saved();
  assert.strictEqual(boardFile('old').cards.filter(c => c.role).length, 2, 'and they are in the board file');

  // Not now takes it as answered
  await open('older');
  await build('Build the basket.', 'Third built.');
  await says(OFFER);
  await tap('Not now');
  assert.strictEqual(roleDocs(await cardsOf()).length, 0, 'Not now adds nothing');
  await build('Build more.', 'Fourth built.');
  await still(page);
  assert.strictEqual((await offers()).length, 1, 'and she doesn’t ask that board again');
  assert.deepStrictEqual(await remembered(), ['old', 'older'], 'each board is remembered by its id');

  // a board that already has them is never offered
  await open('has');
  await build('Build the checkout.', 'Fifth built.');
  await still(page);
  assert.strictEqual((await offers()).length, 0, 'a board that has them is never offered the cards');
  assert.deepStrictEqual(await remembered(), ['old', 'older'], 'nor remembered');
  assert.deepStrictEqual(l.errors, []);
  console.log('GUIDE OFFER OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
