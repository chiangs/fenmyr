// Myra's offer of a prototype board is kept until the board is made, and builds only where its card says, through a
// stand-in Claude Code. Her bubble with an offer stays up until it is answered. Pressed in that bubble once another
// board is open, it makes nothing. Cancel in the project picker, a Repo dialog closed with Escape, and a prototype that
// can't be made each leave the offer with its buttons. A double click makes one board and one build.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { type Launched, launch, settle } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-offer-kept-')));
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
  beta = repo('beta'),
  quiet = repo('quiet'),
  gone = repo('gone'),
  data = path.join(work, 'data'),
  builds = path.join(work, 'builds.jsonl'),
  delay = path.join(work, 'build-delay');

const offer = (name: string) => ({
  say: `That needs code, so I’d make ${name} a prototype board.`,
  offerPrototype: { name, device: 'phone', from: ['n1', 'n2'], build: `Build ${name} from the notes` },
});
const REPLIES = {
  OFFER_FIVE: offer('Signup'),
  OFFER_LOOSE: offer('Loose'),
  OFFER_BROKEN: offer('Broken'),
  OFFER_EIGHT: offer('Order'),
  OFFER_ONE: offer('Checkout'),
};
// a stand-in Claude Code: a build waits as long as build-delay says, then writes the prototype's App
const buildsAt = JSON.stringify(builds),
  delayAt = JSON.stringify(delay),
  replies = JSON.stringify(REPLIES);
fs.mkdirSync(path.join(data, '.local/bin'), { recursive: true });
fs.writeFileSync(
  path.join(data, '.local/bin/claude'),
  `#!${process.execPath}
const fs = require('node:fs');
const [flag, prompt = ''] = process.argv.slice(2);
if (flag !== '-p') process.exit(0);
const result = text => console.log(JSON.stringify({ type: 'result', is_error: false, result: text }));
if (process.argv.includes('stream-json')) {
  fs.appendFileSync(${buildsAt}, JSON.stringify({ cwd: process.cwd() }) + '\\n');
  const end = Date.now() + (fs.existsSync(${delayAt}) ? Number(fs.readFileSync(${delayAt}, 'utf8')) : 0);
  while (Date.now() < end) {}
  fs.writeFileSync('src/App.tsx', 'export function App() { return <h1>Built</h1>; }\\n');
  result('I built it.\\nCARDS: none');
} else {
  const q = (/The person asked you: (.*)/.exec(prompt) ?? [])[1] ?? '';
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
      { id: 'pb', name: 'Beta', open: true, repo: { path: beta } },
      { id: 'pq', name: 'Quiet', open: true },
      { id: 'pg', name: 'Gone', open: true, repo: { path: gone } },
    ],
    folders: [
      { id: 'fa', name: 'Ideas', project: 'pa', open: true },
      { id: 'fb', name: 'Beta ideas', project: 'pb', open: true },
      { id: 'fg', name: 'Gone ideas', project: 'pg', open: true },
      { id: 'fl', name: 'Loose', open: true },
    ],
    order: {},
  }),
);
const boards = [
  { ...replyBoard('one', 'One'), folder: 'fa' },
  { ...replyBoard('five', 'Five'), folder: 'fb' },
  { ...replyBoard('loose', 'Loose'), folder: 'fl' },
  { ...replyBoard('broken', 'Broken'), folder: 'fg' },
  { ...replyBoard('eight', 'Eight'), folder: 'fa' },
];
const l: Launched = await launch({ data, boards, open: 'one' });

const built = () => (fs.existsSync(builds) ? fs.readFileSync(builds, 'utf8').trim().split('\n').length : 0);
const protos = () => l.page.evaluate(() => window.__fenmyr.lib().boards.filter(b => b.prototype).length);
const kind = () => l.page.evaluate(() => window.__fenmyr.curBoard().kind ?? 'board');
// the offers kept in a board's file
const stored = (id: string): number => {
  const file = path.join(data, 'fenmyr', 'boards', `${id}.json`);
  const chat: { acts?: { kind: string }[] }[] = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8')).chat
    : [];
  return (chat ?? []).flatMap(m => m.acts ?? []).filter(a => a.kind === 'offer').length;
};
const buttonsOf = (say: string) =>
  l.page.evaluate(say => {
    const m = [...document.querySelectorAll('#mcList .mc-msg.myra')].findLast(m => m.firstChild?.textContent === say);
    return m ? [...m.querySelectorAll('.m-acts button')].map(b => b.textContent) : null;
  }, say);
const myraSaid = () =>
  l.page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.firstChild?.textContent ?? '');
const bubble = () =>
  l.page.evaluate(() => ({
    on: !!document.getElementById('mBubble')?.classList.contains('on'),
    head: document.querySelector('#mActs .m-summary.offer b')?.textContent ?? null,
    buttons: [...document.querySelectorAll('#mActs button')].map(b => b.textContent),
  }));
const ask = (q: string) => l.page.evaluate(q => window.__fenmyr.ask(q), q);
const open = async (id: string, chat = true) => {
  await l.page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(l.page, 400);
  await l.page.evaluate(chat => {
    if (chat !== !!document.getElementById('myra')?.classList.contains('chat'))
      document.getElementById(chat ? 'mPill' : 'mcClose')?.click();
  }, chat);
  await settle(l.page, 300);
};
const tap = (label: string) => l.page.locator('#mcList .m-acts button', { hasText: label }).last().click();
const until = async (check: () => boolean | Promise<boolean>, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await l.page.waitForTimeout(200);
  }
  assert.fail(`${what}: not within ${ms} ms`);
};
const pickFolder = (dir: string) =>
  l.app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, dir);
const press = async (action: string) => {
  await l.page.click(`.rl-body [data-a="${action}"]`);
  await l.page.waitForFunction(
    () => !document.querySelector('.rl-body') || !!document.querySelector('.rl-body button:not([disabled])'),
  );
};
// the offer is still there to press: its buttons under her line, and in the board's file
const kept = async (id: string, say: string) => {
  await settle(l.page, 600);
  assert.deepStrictEqual(await buttonsOf(say), ['Start and build', 'Not now'], 'the card keeps its buttons');
  assert.strictEqual(stored(id), 1, 'and the board’s file keeps the offer');
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

try {
  await check('with the chat closed, her bubble with an offer stays up until it is answered', async () => {
    await open('five', false);
    await l.page.evaluate(r => window.__fenmyr.applyMyra(r, 'q'), REPLIES.OFFER_FIVE);
    await l.page.waitForTimeout(10000);
    assert.deepStrictEqual(
      await bubble(),
      { on: true, head: 'New prototype board: Signup', buttons: ['Start and build', 'Not now'] },
      'still up after 10 seconds',
    );
    await l.page.locator('#mActs button', { hasText: 'Not now' }).click();
    assert.strictEqual((await bubble()).on, false, 'and gone once answered');
  });

  await check('pressed in her bubble once another board is open, Start and build makes nothing', async () => {
    await l.page.evaluate(r => window.__fenmyr.applyMyra(r, 'q'), REPLIES.OFFER_FIVE);
    const before = { protos: await protos(), builds: built() };
    await open('one', false);
    assert.ok((await bubble()).buttons.includes('Start and build'), 'the bubble is still up on One');
    await l.page.locator('#mActs button', { hasText: 'Start and build' }).click();
    await settle(l.page, 2000);
    assert.strictEqual(await l.page.evaluate(() => window.__fenmyr.curBoard().id), 'one', 'One stays open');
    assert.deepStrictEqual({ protos: await protos(), builds: built() }, before, 'no board is made and nothing builds');
    assert.deepStrictEqual((await bubble()).buttons, [], 'the buttons go away');
    await open('five');
    await kept('five', REPLIES.OFFER_FIVE.say);
  });

  await check('Cancel in the project picker keeps the offer', async () => {
    await open('loose');
    await ask('Make it work OFFER_LOOSE');
    await tap('Start and build');
    await l.page.click('.tdlg.sp [data-project=""]');
    await kept('loose', REPLIES.OFFER_LOOSE.say);
  });

  await check('a Repo dialog closed with Escape keeps the offer, which is spent once the board is made', async () => {
    const before = await protos();
    await tap('Start and build');
    await l.page.click('.tdlg.sp [data-project="pq"]');
    await pickFolder(quiet);
    await press('pick');
    await l.page.keyboard.press('Escape');
    assert.strictEqual(await protos(), before, 'no board is made');
    await kept('loose', REPLIES.OFFER_LOOSE.say);
    await tap('Start and build');
    await l.page.click('.tdlg.sp [data-project="pq"]');
    await until(async () => (await kind()) === 'prototype', 'the board opens');
    await settle(l.page, 600);
    assert.strictEqual(stored('loose'), 0, 'and then the offer is spent');
  });

  await check('a prototype that can’t be made keeps the offer', async () => {
    const before = await protos();
    await open('broken');
    await ask('Make it work OFFER_BROKEN');
    fs.rmSync(gone, { recursive: true, force: true });
    await tap('Start and build');
    await until(async () => (await myraSaid()).startsWith('I couldn’t make “Broken”'), 'she says why');
    assert.strictEqual(await protos(), before, 'no board is made');
    await kept('broken', REPLIES.OFFER_BROKEN.say);
  });

  await check('a double click on Start and build makes one board and one build', async () => {
    fs.writeFileSync(delay, '8000');
    const before = { protos: await protos(), builds: built() };
    await open('eight');
    await ask('Make the order work OFFER_EIGHT');
    await l.page.locator('#mcList .m-acts button', { hasText: 'Start and build' }).last().dblclick();
    await until(async () => (await kind()) === 'prototype', 'the board opens');
    await until(() => built() > before.builds, 'the build starts');
    await settle(l.page, 1500);
    assert.deepStrictEqual(
      { protos: await protos(), builds: built() },
      {
        protos: before.protos + 1,
        builds: before.builds + 1,
      },
    );
  });

  assert.deepStrictEqual(l.errors, [], 'no page errors');
  assert.deepStrictEqual(failed, [], 'checks that failed');
  console.log('OFFER KEPT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
