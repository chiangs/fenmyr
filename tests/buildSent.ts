// What a whole-board build sends the builder of a board with a wireframe screen and 100 notes: every note, since the
// page no longer cuts the cards at 80, in reading order rather than the board file's order, the screen with its size and
// each piece on it with its place and size inside the screen. A picture of the screen is taken when it is in view and
// left out of the prompt when it is not, though its layout is sent either way.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { type Card, isRecord } from '../src/shared/model.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { calm } from './support/calm.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';

const { repo } = freshRepo('fenmyr-build-sent-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');

const l = await launch({ claude: true });
const standIn = buildStandIn(l);
const { page } = l;

const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const landed = (reply: string) =>
  page.waitForFunction(
    t => [...document.querySelectorAll('#mcList .mc-msg')].some(m => m.firstChild?.textContent === t),
    reply,
  );
// the cards and the pictures sections of a build's prompt
type Sent = { id: string; at?: unknown; size?: unknown };
function sections(prompt: string) {
  const found = /\nTHE CARDS ON THE BOARD \([^\n]*\):\n([\s\S]*?)\n\nPICTURES OF THEM[^\n]*\n([\s\S]*?)\n\n/.exec(
    prompt,
  );
  assert(found, 'the prompt has its cards and its pictures');
  const [, list = '', pictures = ''] = found;
  const sent: unknown = JSON.parse(list);
  assert(Array.isArray(sent), 'the cards are a list');
  const cards = sent.flatMap((c: unknown): Sent[] =>
    isRecord(c) && typeof c.id === 'string' ? [{ id: c.id, at: c.at, size: c.size }] : [],
  );
  return { cards, pictures, ids: cards.map(c => c.id), card: (id: string) => cards.find(c => c.id === id) };
}
// the screen on the canvas, and whether any of it is in the window
const screenInView = () =>
  page.evaluate(() => {
    const r = document.querySelector('#cards .card[data-id="scr"]')?.getBoundingClientRect();
    return !!r && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  });
const look = async (x: number) => {
  await page.evaluate(x => {
    Object.assign(window.__fenmyr.view, { x, y: 40, z: 0.8 });
    window.__fenmyr.applyView();
  }, x);
  await calm(page);
};

try {
  await page.evaluate(async repo => {
    // n0 is first in the board's array and lowest on the board; n50 comes later and sits top left, above everything
    const note = (id: string, x: number, y: number, text: string): Card => ({
      id,
      type: 'note',
      x,
      y,
      w: 220,
      h: 140,
      text,
    });
    const cards: Card[] = [
      note('n0', -2000, 9000, 'Lowest'),
      {
        id: 'scr',
        type: 'frame',
        x: 1000,
        y: 0,
        w: 393,
        h: 852,
        device: 'iPhone',
        radius: 44,
        name: 'Checkout screen',
      },
      { id: 'total', type: 'text', x: 1040, y: 100, w: 220, h: 24, text: 'Order total', onFrame: 'scr' },
      { id: 'pay', type: 'box', x: 1024, y: 300, w: 160, h: 100, onFrame: 'scr' },
      ...Array.from({ length: 99 }, (_, i) => {
        const n = i + 1;
        return n === 50
          ? note('n50', -2400, -400, 'Top left')
          : note(`n${n}`, -2000 + (n % 10) * 260, Math.floor(n / 10) * 200, `Note ${n}`);
      }),
    ];
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards,
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await page.waitForFunction(() => document.querySelector('#cards .card[data-id="scr"]'));
  await still(page);

  // nothing is selected, so this is a whole-board build, with the screen scrolled out of view
  await look(-3000);
  assert(!(await screenInView()), 'the screen is out of view');
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>One</h1>;\n' }, reply: 'First.' });
  await build('Build the checkout.');
  await landed('First.');
  const [first] = standIn.builds();
  assert(first, 'the builder was run');
  const out = sections(first);
  const { ids } = out;
  assert(ids.includes('n99'), 'the 100th note is sent, which a cap of 80 cards would have dropped');
  assert.strictEqual(ids.length, 103, 'with every card');
  assert(ids.includes('n0'), 'and the lowest');
  assert(ids.indexOf('n50') < ids.indexOf('n0'), 'the top left note comes before the lowest, as the board reads');
  assert.deepStrictEqual(
    out.card('total')?.at,
    { x: 40, y: 100, w: 220, h: 24 },
    'a piece carries its place and size inside its screen',
  );
  assert.deepStrictEqual(out.card('pay')?.at, { x: 24, y: 300, w: 160, h: 100 }, 'and so does the next');
  assert.deepStrictEqual(out.card('scr')?.size, { w: 393, h: 852 }, 'the screen carries its size');
  assert.strictEqual(out.pictures, 'none', 'a screen out of view sends no picture');

  await look(-700);
  assert(await screenInView(), 'the screen is in view');
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Two</h1>;\n' }, reply: 'Second.' });
  await build('Build the checkout again.');
  await landed('Second.');
  const second = standIn.builds().at(1);
  assert(second, 'the builder was run again');
  const seen = sections(second);
  assert.strictEqual(seen.pictures.split('\n').length, 1, 'a screen in view sends one picture');
  assert.match(seen.pictures, /\/1\.png \(frame Checkout screen\)$/, 'of the screen');
  assert.strictEqual(seen.cards.length, 103, 'and every card still goes');
} finally {
  await l.close();
}
console.log('BUILD SENT OK');
