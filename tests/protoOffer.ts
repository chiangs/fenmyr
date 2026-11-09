// Myra's offer of a prototype board, through a stand-in Claude Code that answers her and writes builds. A request that
// needs code gets her line and an offer card, which outlasts a restart with its buttons. Start and build makes the
// prototype board from the cards she named and starts its build. A project with no repo offers Link a repo first, in
// the chat and in her bubble, and once it is linked the chat shows the card with Start and build. Not now takes the card
// away. A malformed offer drops alone. On a prototype board she is never asked for one and never shows one.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { type Launched, launch, settle } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-offer-')));
const repo = (name: string) => {
  const dir = path.join(work, name);
  fs.mkdirSync(dir);
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['config', 'user.name', 'Ann Lee'],
    ['config', 'user.email', 'ann@example.com'],
  ])
    execFileSync('git', ['-C', dir, ...args]);
  return dir;
};
const acme = repo('acme'),
  shop = repo('shop'),
  data = path.join(work, 'data'),
  asks = path.join(work, 'asks.jsonl'),
  builds = path.join(work, 'builds.jsonl');

const SAID = 'That needs code, so I’d make it a prototype board.';
const REPLIES = {
  OFFER: {
    say: SAID,
    offerPrototype: {
      name: 'Checkout',
      device: 'phone',
      purpose: 'Try a shorter checkout',
      from: ['n1', 'n2'],
      build: 'Build the checkout from the two notes',
    },
  },
  GONE: {
    say: 'That needs code, so I’d make a diary prototype.',
    offerPrototype: { name: 'Diary', from: ['n9'], build: 'Build a diary' },
  },
  NAMED: {
    say: 'That needs code, so I’d make it in Shop.',
    offerPrototype: { name: 'Basket', project: 'Shop', from: ['n1'], build: 'Build the basket' },
  },
  BROKEN: {
    say: 'Here are two notes.',
    add: [{ text: 'Kept one' }, { text: 'Kept two' }],
    offerPrototype: 'one please',
  },
};
// a stand-in Claude Code: a build writes the prototype's App and says so, and a question gets the reply its words name
const buildsAt = JSON.stringify(builds),
  asksAt = JSON.stringify(asks),
  replies = JSON.stringify(REPLIES);
fs.mkdirSync(path.join(data, '.local/bin'), { recursive: true });
fs.writeFileSync(
  path.join(data, '.local/bin/claude'),
  `#!${process.execPath}
const fs = require('node:fs');
const [flag, prompt = ''] = process.argv.slice(2);
if (flag !== '-p') process.exit(0);
const log = (file, entry) => fs.appendFileSync(file, JSON.stringify(entry) + '\\n');
const result = text => console.log(JSON.stringify({ type: 'result', is_error: false, result: text }));
if (process.argv.includes('stream-json')) {
  log(${buildsAt}, { prompt, cwd: process.cwd() });
  fs.writeFileSync('src/App.tsx', 'export function App() { return <h1>Checkout</h1>; }\\n');
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: process.cwd() + '/src/App.tsx' } }] } }));
  result('I built it.\\nCARDS: none');
} else {
  const q = (/The person asked you: (.*)/.exec(prompt) ?? [])[1] ?? '';
  log(${asksAt}, { q, prompt });
  const replies = ${replies};
  const key = Object.keys(replies).find(k => q.includes(k));
  result(JSON.stringify(key ? replies[key] : { say: 'ok' }));
}
`,
  { mode: 0o755 },
);
fs.mkdirSync(path.join(data, 'fenmyr'), { recursive: true });
fs.writeFileSync(
  path.join(data, 'fenmyr', 'folders.json'),
  JSON.stringify({
    projects: [
      { id: 'pa', name: 'Acme', open: true, repo: { path: acme } },
      { id: 'ps', name: 'Shop', open: true },
    ],
    folders: [
      { id: 'fa', name: 'Ideas', project: 'pa', open: true },
      { id: 'fp', name: 'Prototypes', project: 'pa', kind: 'prototyping', open: true },
      { id: 'fs', name: 'Shop ideas', project: 'ps', open: true },
    ],
    order: {},
  }),
);

const boards = [
  { ...replyBoard('one', 'One'), folder: 'fa' },
  { ...replyBoard('two', 'Two'), folder: 'fs' },
];
let l: Launched = await launch({ data, boards, open: 'one' });
const pickFolder = (dir: string) =>
  l.app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, dir);

const lines = (file: string): { prompt: string; cwd?: string; q?: string }[] =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map(s => JSON.parse(s))
    : [];
const myra = () =>
  l.page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.myra')].map(m => ({
      text: m.firstChild?.textContent ?? '',
      head: m.querySelector('.m-summary.offer b')?.textContent ?? null,
      lines: [...m.querySelectorAll('.m-summary.offer li')].map(li => li.textContent ?? ''),
      buttons: [...m.querySelectorAll('.m-acts button')].map(b => `${b.className}:${b.textContent}`),
    })),
  );
const lineOf = async (text: string) => (await myra()).findLast(m => m.text === text);
const ask = (q: string) => l.page.evaluate(q => window.__fenmyr.ask(q), q);
const open = async (id: string) => {
  await l.page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(l.page, 400);
  await l.page.evaluate(() => {
    if (!document.getElementById('myra')?.classList.contains('chat')) document.getElementById('mPill')?.click();
  });
  await settle(l.page, 300);
};
const tap = (label: string) => l.page.locator('#mcList .m-acts button', { hasText: label }).last().click();
const until = async (check: () => boolean | Promise<boolean>, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await l.page.waitForTimeout(200);
  }
  assert.fail(`${what}: not within ${ms} ms`);
};
const press = async (action: string) => {
  await l.page.click(`.rl-body [data-a="${action}"]`);
  await l.page.waitForFunction(
    () => !document.querySelector('.rl-body') || !!document.querySelector('.rl-body button:not([disabled])'),
  );
};

// Each check runs even when an earlier one fails, so a run on an older build lists everything it lacks.
const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

const ACME_CARD = {
  text: SAID,
  head: 'New prototype board: Checkout',
  lines: [
    'Made from 2 cards: “First note” and “Second note”',
    'Code goes in acme/prototypes/checkout',
    'React, for phones',
  ],
  buttons: [':Start and build', 'ghost:Not now'],
};
let made = '';

try {
  await open('one');
  await check('on an ordinary board she is told how to offer a prototype board', async () => {
    await ask('What would you make here?');
    const prompt = lines(asks).at(-1)?.prompt ?? '';
    assert.match(prompt, /NEEDS CODE: when what they ask for only works as running code/);
    assert.match(prompt, /"offerPrototype": \{"name"/);
    assert.match(
      prompt,
      /Nothing exists until they press Start and build, so in "say" offer it .* and never say you've made, set up or created a board or a card\./,
      'and not to say the board is made before it is',
    );
  });

  await check('a request that needs code gets her line and an offer card', async () => {
    await ask('Make the checkout work OFFER');
    assert.deepStrictEqual(await lineOf(SAID), ACME_CARD);
  });

  await check('the card outlasts a restart, and its buttons are still there', async () => {
    await settle(l.page, 600);
    await l.close();
    l = await launch({ data, open: 'one' });
    await open('one');
    assert.deepStrictEqual(await lineOf(SAID), ACME_CARD);
  });

  await check('Start and build makes the prototype board from her cards and starts its build', async () => {
    await tap('Start and build');
    await until(() => l.page.evaluate(() => window.__fenmyr.curBoard().kind === 'prototype'), 'the new board opens');
    const b = await l.page.evaluate(() => window.__fenmyr.curBoard());
    assert.ok(b.kind === 'prototype');
    made = b.id;
    assert.deepStrictEqual(
      [b.name, b.folder, b.proto.dir, b.proto.stack, b.proto.device, b.proto.purpose],
      ['Checkout', 'fp', 'prototypes/checkout', 'react', 'phone', 'Try a shorter checkout'],
      'named as she offered, in Acme’s prototyping folder',
    );
    assert.ok(fs.existsSync(path.join(acme, 'prototypes/checkout/src/App.tsx')), 'its code is in the repo');
    const brought = b.cards.filter(c => c.text === 'First note' || c.text === 'Second note');
    assert.strictEqual(brought.length, 2, 'copies of the two cards are on it');
    assert.ok(
      brought.every(c => c.id !== 'n1' && c.id !== 'n2'),
      'as copies',
    );
    assert.deepStrictEqual(
      (await l.page.evaluate(() => window.__fenmyr.sel)).sort(),
      brought.map(c => c.id).sort(),
      'and selected',
    );
    await until(() => lines(builds).length === 1, 'the build starts');
    const [build] = lines(builds);
    assert.ok(build);
    assert.strictEqual(build.cwd, path.join(acme, 'prototypes/checkout'), 'in the new prototype’s folder');
    for (const words of ['Build the checkout from the two notes', 'First note', 'Second note'])
      assert.ok(build.prompt.includes(words), `the build is asked for with “${words}”`);
    await until(async () => !!(await lineOf('I built it.')), 'the build lands in the new board’s chat');
    assert.match(fs.readFileSync(path.join(acme, 'prototypes/checkout/src/App.tsx'), 'utf8'), /Checkout/);
  });

  await check('back on the board she offered it on, the card is gone and her line stays', async () => {
    await open('one');
    assert.deepStrictEqual(await lineOf(SAID), { text: SAID, head: null, lines: [], buttons: [] });
    const file = JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'one.json'), 'utf8'));
    const kept = file.chat.findLast((m: { text: string }) => m.text === SAID);
    assert.strictEqual(kept?.acts, undefined, 'and the board file keeps no offer');
  });

  await check('with none of the cards she named left, the build is sent with no cards', async () => {
    await ask('Make a diary GONE');
    assert.deepStrictEqual((await lineOf(REPLIES.GONE.say))?.lines[0], 'Made from your request');
    const n = lines(builds).length;
    await tap('Start and build');
    await until(() => lines(builds).length === n + 1, 'the build starts');
    const prompt = lines(builds).at(-1)?.prompt ?? '';
    assert.match(prompt, /THE CARDS ON THE BOARD \(the ones selected, or all of them\):\n\[\]\n/, 'with no cards');
    assert.ok(!prompt.includes('A new prototype? Exciting!'), 'not even her welcome notes');
    await until(async () => !!(await lineOf('I built it.')), 'the build lands');
  });

  await check('a project with no repo offers Link a repo first, and once linked, Start and build', async () => {
    await open('two');
    await ask('Make the checkout work OFFER');
    assert.deepStrictEqual(await lineOf(SAID), {
      ...ACME_CARD,
      lines: [ACME_CARD.lines[0], 'Code goes in a repo linked to “Shop”', 'React, for phones'],
      buttons: [':Link a repo first', 'ghost:Not now'],
    });
    await l.page.evaluate(() => document.getElementById('mcClose')?.click());
    await l.page.evaluate(r => window.__fenmyr.applyMyra(r, 'q'), REPLIES.OFFER);
    assert.deepStrictEqual(
      await l.page.evaluate(() =>
        [...document.querySelectorAll('#mActs button')].map(b => `${b.className}:${b.textContent}`),
      ),
      [':Link a repo first', 'ghost:Not now'],
      'with the chat closed, her bubble offers the same',
    );
    await pickFolder(shop);
    await l.page.locator('#mActs button', { hasText: 'Link a repo first' }).click();
    assert.strictEqual(await l.page.textContent('.rl h3'), 'Repo for “Shop”', 'the Repo dialog opens for Shop');
    await press('pick');
    await press('done');
    await settle(l.page, 300);
    assert.ok(
      await l.page.evaluate(() => document.getElementById('myra')?.classList.contains('chat')),
      'the chat opens',
    );
    assert.deepStrictEqual(await lineOf(SAID), {
      ...ACME_CARD,
      lines: [ACME_CARD.lines[0], 'Code goes in shop/prototypes/checkout', 'React, for phones'],
    });
  });

  await check('Not now takes the card away and makes nothing', async () => {
    const before = await l.page.evaluate(() => window.__fenmyr.lib().boards.length);
    await tap('Not now');
    await settle(l.page, 300);
    assert.deepStrictEqual(await lineOf(SAID), { text: SAID, head: null, lines: [], buttons: [] });
    assert.strictEqual(await l.page.evaluate(() => window.__fenmyr.curBoard().id), 'two', 'the board stays open');
    assert.strictEqual(await l.page.evaluate(() => window.__fenmyr.lib().boards.length), before, 'no board is made');
  });

  await check('an offer naming another project shows its repo, and Start and build makes the board there', async () => {
    await open('one');
    await ask('Make the basket work NAMED');
    assert.deepStrictEqual(await lineOf(REPLIES.NAMED.say), {
      text: REPLIES.NAMED.say,
      head: 'New prototype board: Basket',
      lines: ['Made from 1 card: “First note”', 'Code goes in shop/prototypes/basket', 'React'],
      buttons: [':Start and build', 'ghost:Not now'],
    });
    const n = lines(builds).length;
    await tap('Start and build');
    await until(() => lines(builds).length === n + 1, 'the build starts');
    assert.strictEqual(lines(builds).at(-1)?.cwd, path.join(shop, 'prototypes/basket'), 'in Shop’s repo');
    const lib = await l.page.evaluate(() => window.__fenmyr.lib());
    const board = lib.boards.find(b => b.name === 'Basket' && b.prototype),
      shopLib = lib.projects.find(p => p.name === 'Shop');
    assert.ok(board?.folder && shopLib?.prototypingFolders.includes(board.folder), 'in a Shop prototyping folder');
    await until(async () => !!(await lineOf('I built it.')), 'the build lands');
    await open('two');
  });

  await check('a malformed offer drops alone, and the rest of her reply lands', async () => {
    await ask('Add two notes BROKEN');
    const line = await lineOf('Here are two notes.');
    assert.ok(line, 'her line shows');
    assert.strictEqual(line.head, null, 'with no offer card');
    const texts = await l.page.evaluate(() => window.__fenmyr.curBoard().cards.map(c => c.text));
    assert.ok(texts.includes('Kept one') && texts.includes('Kept two'), 'and her notes are on the board');
  });

  await check(
    'on a prototype board she is never asked for an offer, and one she sends anyway shows no card',
    async () => {
      assert.ok(made, 'the prototype board from Start and build');
      await open(made);
      await ask('Make the checkout work OFFER');
      const prompt = lines(asks).at(-1)?.prompt ?? '';
      assert.match(prompt, /"prototype":\s*\{"stack"/, 'the question went from the prototype board');
      assert.ok(!prompt.includes('NEEDS CODE') && !prompt.includes('offerPrototype'), 'with no word of offers');
      const line = await lineOf(SAID);
      assert.ok(line, 'her line shows');
      assert.strictEqual(line.head, null, 'with no offer card');
    },
  );

  assert.deepStrictEqual(l.errors, [], 'no page errors');
  assert.deepStrictEqual(failed, [], 'checks that failed');
  console.log('PROTO OFFER OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
