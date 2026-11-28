// What a build sends the builder of the wires between the cards it sends, and which way each points. A card's brief
// lists the wires drawn from it: the card at the other end, and "end" for an arrow that points to it, "both" for one
// that points both ways, "none" for a wire that points nowhere. A wire to a card that is not sent, such as the board's
// own rules, is left out, and so is one whose other end is not selected when only some cards are. The prompt says what
// the list means.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../src/shared/model.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';

const { repo } = freshRepo('fenmyr-wire-arrows-build-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));

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

// the cards of a build's prompt, by id, with the wires each lists
function cardsOf(prompt: string) {
  const found = /\nTHE CARDS ON THE BOARD \(([^\n]*)\):\n([\s\S]*?)\n\nPICTURES OF THEM/.exec(prompt);
  assert(found, 'the prompt has its cards');
  const [, words = '', list = ''] = found;
  const sent: unknown = JSON.parse(list);
  assert(Array.isArray(sent), 'the cards are a list');
  return { words, wires: new Map(sent.flatMap(c => (isRecord(c) ? [[String(c.id), c.wires] as const] : []))) };
}

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    const note = (id: string, y: number) => ({
      id,
      type: 'note' as const,
      x: 0,
      y,
      w: 220,
      h: 140,
      text: id,
    });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [
        note('cart', 0),
        note('pay', 300),
        note('done', 600),
        { id: 'rules', type: 'doc', x: 400, y: 0, w: 240, h: 52, body: 'Never use gradients.', role: 'rules' },
      ],
      links: [
        { id: 'w1', a: 'cart', b: 'pay', arrow: true },
        { id: 'w2', a: 'pay', b: 'done', arrow: 'both' },
        { id: 'w3', a: 'done', b: 'cart' },
        { id: 'w4', a: 'cart', b: 'rules', arrow: true },
        { id: 'w5', a: 'pay', b: 'cart', arrow: false },
      ],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await page.waitForFunction(() => document.querySelector('#cards .card[data-id="done"]'));
  await still(page);

  // nothing is selected, so every card is sent, but the rules, whose wire goes unsent
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>One</h1>;\n' }, reply: 'First.' });
  await build('Build the checkout.');
  await landed('First.');
  const [first] = standIn.builds();
  assert(first, 'the builder was run');
  const whole = cardsOf(first);
  assert.deepStrictEqual(
    [...whole.wires.keys()],
    ['cart', 'pay', 'done'],
    'the three notes are sent, and not the rules',
  );
  assert.deepStrictEqual(
    whole.wires.get('cart'),
    [{ to: 'pay', arrow: 'end' }],
    'cart’s wire to pay, whose arrow is true, points to it; its wire to the rules is left out',
  );
  assert.deepStrictEqual(
    whole.wires.get('pay'),
    [
      { to: 'done', arrow: 'both' },
      { to: 'cart', arrow: 'none' },
    ],
    'pay’s two: to done pointing both ways, and to cart, whose arrow is false, pointing nowhere',
  );
  assert.deepStrictEqual(whole.wires.get('done'), [{ to: 'cart', arrow: 'none' }], 'a wire with no arrow says none');
  assert.match(
    whole.words,
    /"wires" on a card lists the wires drawn from it to another card here, each with that card's id as "to" and "arrow": "end" when it points to that card, "both" when it points both ways, "none" when it points nowhere/,
    'the prompt says what the list means',
  );

  // a wire whose other end is not among the cards chosen is left out
  await page.evaluate(() => window.__fenmyr.selectOnly(['cart', 'done']));
  standIn.next({ files: { 'src/App.tsx': 'export const App = () => <h1>Two</h1>;\n' }, reply: 'Second.' });
  await build('Build only these.');
  await landed('Second.');
  const second = standIn.builds().at(1);
  assert(second, 'the builder was run again');
  const chosen = cardsOf(second);
  assert.deepStrictEqual([...chosen.wires.keys()], ['cart', 'done'], 'two cards are sent');
  assert.deepStrictEqual(chosen.wires.get('cart'), undefined, 'cart’s wire to pay, which is not sent, is left out');
  assert.deepStrictEqual(chosen.wires.get('done'), [{ to: 'cart', arrow: 'none' }], 'and done’s to cart stays');
} finally {
  await l.close();
}
console.log('WIRE ARROWS BUILD OK');
