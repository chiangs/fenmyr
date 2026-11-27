// Stop, or Ctrl+., ends the open prototype's builds, the running one and those waiting their turn, with its questions, in one
// press and with one line of hers. The running build's Claude Code is killed and its block reads stopped, keeping the
// files it wrote and its Undo, with no failure line and no startle. A waiting build reads not started and never reaches
// Claude Code. Builds of other boards go on, the button is Stop only for a board that has one, and a press that comes
// before the host has said which build is running, or when it turns the build away, still ends it.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { replyBoard } from './fixtures/boards.ts';
import { alive, buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { LINE } from './support/stopKit.ts';

const { work, repo } = freshRepo('fenmyr-build-stop-');
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');

const l = await launch({ boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const { page } = l;
const standIn = buildStandIn(l);

type Block = { head: string; lines: string[] };
const blocks = (): Promise<Block[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare .m-summary')].map(b => ({
      head: b.querySelector('b')?.textContent ?? '',
      lines: [...b.querySelectorAll('li')].map(li => li.textContent ?? ''),
    })),
  );
const heads = async () => (await blocks()).map(b => b.head);
// her words, each with the buttons under it
const said = (): Promise<{ text: string; buttons: string[] }[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.myra:not(.bare):not(.typing)')].map(m => ({
      text: m.firstChild?.textContent ?? '',
      buttons: [...m.querySelectorAll('button')].map(b => b.textContent ?? ''),
    })),
  );
const count = async (text: string) => (await said()).filter(s => s.text === text).length;
const isStop = () => page.evaluate(() => document.getElementById('mcSend')?.classList.contains('stop') === true);
const until = async (what: string, ok: () => boolean | Promise<boolean>, ms = 20000) => {
  for (const end = Date.now() + ms; Date.now() < end; await pause(50)) if (await ok()) return;
  assert.fail(`never happened: ${what}: ${JSON.stringify(await blocks())} ${JSON.stringify(await said())}`);
};
const build = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await still(page);
};
const reaction = () => page.evaluate(() => window.__fenmyr.lastReaction().name);
const calm = () =>
  page.evaluate(() => {
    window.__fenmyr.stopAnim();
    window.__fenmyr.forgetReactions();
  });
// the board's file as the host has it saved, where a build's end is kept
const chatOf = (id: string): { acts?: { kind: string; end?: { kind: string } }[] }[] =>
  JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', `${id}.json`), 'utf8')).chat ?? [];
const ended = (id: string, n: number) =>
  chatOf(id)
    .flatMap(m => m.acts ?? [])
    .filter(a => a.kind === 'build' && a.end).length === n;
const dirOf = (id: string): Promise<string> =>
  page.evaluate(id => {
    const b = window.__fenmyr.board;
    if (b.id !== id || b.kind !== 'prototype') throw new Error(`${id} is not open`);
    return b.proto.dir;
  }, id);
const App = 'export const App = () => <h1>Hello</h1>;\n';
const Total = 'export const Total = () => <p>Total</p>;\n';

// a build that stays alive after its first file, until it is released
const holds = () => standIn.next({ files: { 'src/App.tsx': App, 'src/Total.tsx': Total }, pause: true });

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    for (const [id, name] of [
      ['pb', 'Checkout'],
      ['pd', 'Receipt'],
      ['pe', 'Invoice'],
      ['pg', 'Basket'],
    ] as const) {
      const proto = await window.Fenmyr.protoCreate({ root: repo, name, stack: 'react' });
      await window.Fenmyr.save({ id, name, folder: 'pf', kind: 'prototype', proto, cards: [], links: [], tray: [] });
    }
    await window.__fenmyr.refreshBoards();
  }, repo);

  // 1. Stop on the button: the running build's Claude Code is killed, its block reads stopped with the files it wrote
  //    and its Undo, and she says one line and doesn't startle.
  await open('pb');
  assert.equal(await isStop(), false, 'with nothing running the button is Send');
  const dir = path.join(repo, await dirOf('pb'));
  const starter = fs.readFileSync(path.join(dir, 'src/App.tsx'), 'utf8');
  holds();
  await build('First build.');
  await until('the first file is written', () => standIn.wrote() === 1);
  await until('the block says it is building', async () => (await heads()).at(-1) === 'Building…');
  const pid = standIn.pid('build');
  assert(pid > 0 && alive(pid), 'Claude Code is partway through the build');
  assert.equal(await isStop(), true, 'a build running makes the button Stop');
  await calm();
  await page.click('#mcSend');
  await until('its Claude Code ends', () => !alive(pid));
  await until('its end is kept on its board', () => ended('pb', 1));
  await until('its block reads stopped', async () => (await heads()).at(-1)?.startsWith('Stopped after') === true);
  const stopped = (await blocks()).at(-1);
  assert(
    stopped?.lines.some(t => t.includes('src/App.tsx')),
    `its block keeps the file it wrote: ${JSON.stringify(stopped)}`,
  );
  assert.equal(await isStop(), false, 'the button is Send again');
  assert.equal(await count(LINE), 1, 'she says she has stopped, once');
  const after = await said();
  assert(!after.some(s => /couldn’t finish|You stopped this build/.test(s.text)), 'and has no failure line');
  const kept = after.find(s => s.buttons.includes('Undo this build'));
  assert.equal(kept?.text, 'I’ve kept what I’d written so far.', 'one line carries the Undo');
  await still(page);
  assert.equal(await reaction(), '', 'a build the person stopped does not startle her');
  assert.equal(standIn.builds().length, 1, 'one build reached Claude Code');
  await page.getByRole('button', { name: 'Undo this build' }).click();
  await until('Undo puts the folder back', () => fs.readFileSync(path.join(dir, 'src/App.tsx'), 'utf8') === starter);

  // the same check proves a build that fails on its own still startles her
  await calm();
  standIn.next({ files: {}, fail: 'It broke.' });
  await build('Broken build.');
  await until('it fails', async () => (await heads()).at(-1)?.startsWith('Stopped after') === true);
  await until('and she is startled', async () => (await reaction()) === 'shook');
  assert(
    (await said()).some(s => s.text === 'I couldn’t finish that. It broke.'),
    'and says so',
  );
  assert.equal(await count(LINE), 1, 'a failure is not a stop');
  assert.equal(await isStop(), false, 'and a build that failed is off the list');

  // 2. One running build, one waiting, and a question on its way: Ctrl+. ends all three with one line.
  holds();
  const was = standIn.builds().length;
  await build('Second build.');
  await until('the second build runs', () => standIn.wrote() === 1);
  const running = standIn.pid('build');
  await build('Third build.');
  await until('the third waits', async () => (await heads()).at(-1) === 'Waiting for the build before it');
  standIn.answer({ say: 'ok' }, 60000);
  await page.fill('#mcInput', 'what next?');
  await page.press('#mcInput', 'Control+Enter');
  await until('the question reaches Claude Code', () => standIn.asks().length === 1);
  const asking = standIn.pid('ask');
  assert(alive(asking) && alive(running), 'a question and a build are under way');
  await page.keyboard.press('Control+.');
  await until('the question ends', () => !alive(asking));
  await until('the build ends', () => !alive(running));
  await until('the waiting build reads not started', async () => (await heads()).at(-1) === 'Not started');
  await until('the running one is kept on its board', () => ended('pb', 3));
  const [first, second] = (await heads()).slice(-2);
  assert(
    first?.startsWith('Stopped after') && second === 'Not started',
    'the running one reads stopped, the other not started',
  );
  assert.equal(standIn.builds().length, was + 1, 'the waiting build never reached Claude Code');
  assert.equal(await count(LINE), 2, 'one line for the press');
  assert.equal(await isStop(), false, 'the button is Send again');
  await page.getByRole('button', { name: 'Undo this build' }).click();
  standIn.answer({ say: 'ok' }, 0);

  // 3. A build on another board goes on. Receipt's waits behind Checkout's, and starts once Checkout's is stopped.
  holds();
  await build('Checkout again.');
  await until('Checkout builds', () => standIn.wrote() === 1);
  const checkout = standIn.pid('build');
  await open('pd');
  assert.equal(await isStop(), false, 'Receipt has nothing to stop, though Checkout builds');
  await build('Receipt build.');
  await until('Receipt’s build waits', async () => (await heads()).at(-1) === 'Waiting for the build before it');
  assert.equal(await isStop(), true, 'a waiting build counts');
  await open('pb');
  standIn.next({ files: { 'src/Receipt.tsx': 'export const Receipt = () => null;\n' }, hold: true });
  await page.click('#mcSend');
  await until('Checkout’s Claude Code ends', () => !alive(checkout));
  await until('Receipt’s build starts by itself', () => standIn.pid('build') !== checkout && standIn.wrote() === 1);
  const receipt = standIn.pid('build');
  assert(alive(receipt), 'and runs');
  standIn.release();
  await open('pd');
  await until('and is built', async () => (await heads()).at(-1)?.startsWith('Built in') === true);
  assert.equal(await isStop(), false, 'the button is Send once it is');

  // 4. A waiting build on one board, with another board's build running: Cancel and Stop each take it off Stop, and
  //    the build on the other board is not touched.
  holds();
  await build('Receipt again.');
  await until('Receipt builds', () => standIn.wrote() === 1);
  const again = standIn.pid('build');
  await open('pb');
  await build('Checkout waits.');
  await until('Checkout’s build waits', async () => (await heads()).at(-1) === 'Waiting for the build before it');
  assert.equal(await isStop(), true, 'it makes the button Stop');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await until('Cancel reads not started', async () => (await heads()).at(-1) === 'Not started');
  assert.equal(await isStop(), false, 'and the button is Send');
  await build('Checkout waits again.');
  await until('another waits', async () => (await heads()).at(-1) === 'Waiting for the build before it');
  const asked = standIn.builds().length;
  await page.click('#mcSend');
  await until('Stop reads not started', async () => (await heads()).at(-1) === 'Not started');
  assert.equal(await isStop(), false, 'and the button is Send');
  assert.equal(await count(LINE), 4, 'with her line');
  assert(alive(again), 'Receipt’s build is still running');
  standIn.release();
  await open('pd');
  await until('Receipt’s build is built', async () => (await heads()).at(-1)?.startsWith('Built in') === true);
  assert.equal(standIn.builds().length, asked, 'and no other build reached Claude Code');
  await open('pb');

  // 5. A press that comes before the host has answered with the build's id is kept, and kills it as the id arrives.
  await page.evaluate(() => {
    const real = window.Fenmyr.protoBuild.bind(window.Fenmyr);
    const gate = Promise.withResolvers<void>();
    Reflect.set(window, 'release', gate.resolve);
    window.Fenmyr.protoBuild = async a => {
      const answer = await real(a);
      await gate.promise;
      window.Fenmyr.protoBuild = real;
      return answer;
    };
  });
  holds();
  await build('Slow answer.');
  await until('its Claude Code has started', () => standIn.wrote() === 1);
  const unnamed = standIn.pid('build');
  assert.equal(await isStop(), true, 'it is stoppable meanwhile');
  const lines = await count(LINE);
  await page.click('#mcSend');
  await until('she says she has stopped', async () => (await count(LINE)) === lines + 1);
  assert(alive(unnamed), 'nothing names the build yet, so it still runs');
  await page.evaluate(() => Reflect.get(window, 'release')());
  await until('it is killed once its id arrives', () => !alive(unnamed));
  await until('its block reads stopped', async () => (await heads()).at(-1)?.startsWith('Stopped after') === true);
  assert.equal(await count(LINE), lines + 1, 'with no other line of stopping');

  // 6. A build the host turns away, stopped meanwhile, is not asked again, and the build after it gets its turn.
  await page.evaluate(() => {
    const real = window.Fenmyr.protoBuild.bind(window.Fenmyr);
    const gate = Promise.withResolvers<void>();
    Reflect.set(window, 'release', gate.resolve);
    window.Fenmyr.protoBuild = async () => {
      await gate.promise;
      window.Fenmyr.protoBuild = real;
      return { kind: 'busy' };
    };
  });
  const before = standIn.builds().length;
  await build('Turned away.');
  await until('its block shows it is starting', async () => (await heads()).at(-1) === 'Starting…');
  await open('pd');
  await build('Receipt behind it.');
  await until(
    'another board’s build waits behind it',
    async () => (await heads()).at(-1)?.startsWith('Waiting') === true,
  );
  await open('pb');
  await page.click('#mcSend');
  standIn.next({ files: { 'src/Later.tsx': 'export const Later = () => null;\n' }, reply: 'Built.' });
  await page.evaluate(() => Reflect.get(window, 'release')());
  await until('it reads not started', async () => (await heads()).at(-1) === 'Not started');
  assert.equal(await isStop(), false, 'the button is Send');
  await open('pd');
  await until('the build behind it gets its turn', async () => (await heads()).at(-1)?.startsWith('Built in') === true);
  assert.equal(standIn.builds().length, before + 1, 'and it is the only build that reached Claude Code');
  await open('pb');
  const all = await heads();
  assert.equal(
    all.filter(h => h === 'Not started').length,
    4,
    'the one turned away reads not started, as the others do',
  );
  assert(!all.some(h => h.startsWith('Waiting')), 'and none waits again');

  // 7. A waiting build leaves the list when its board is deleted, when every chat is cleared, and when its board's file
  //    goes, which the build behind it learns as its turn comes.
  const listed = (id: string) => page.evaluate(id => window.__fenmyr.stoppable(id), id);
  const waitsOn = async (...ids: string[]) => {
    holds();
    await open('pd');
    await build('Receipt held.');
    await until('Receipt builds', () => standIn.wrote() === 1);
    for (const id of ids) {
      await open(id);
      await build(`${id} waits.`);
      await until(`${id} waits`, async () => (await heads()).at(-1) === 'Waiting for the build before it');
      assert.equal(await listed(id), true, `${id}’s waiting build is on the list`);
    }
  };
  const finish = () => {
    standIn.next({ files: {}, reply: 'ok' });
    standIn.release();
  };
  const boardFile = (id: string) => path.join(l.data, 'fenmyr', 'boards', `${id}.json`);

  await waitsOn('pe');
  await open('one');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.board-row')].find(
      r => r.querySelector('span')?.textContent === 'Invoice',
    );
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
    document.querySelector<HTMLElement>('#rowMenu [data-m="del"]')?.click();
    document.querySelector<HTMLElement>('#rowMenu [data-m="yes"]')?.click();
  });
  await until('Invoice is deleted in the library', () => !fs.existsSync(boardFile('pe')));
  assert.equal(await listed('pe'), false, 'a deleted board’s build is off the list');
  assert.equal(await listed('pd'), true, 'and the build that runs is not');
  finish();
  await until('Receipt’s build ends', async () => !(await listed('pd')));

  await waitsOn('pb', 'pg');
  await page.evaluate(() => document.getElementById('clearChats')?.click());
  await until(
    'Clear all chats takes their builds off the list',
    async () => !(await listed('pb')) && !(await listed('pg')),
  );
  assert.equal(await listed('pd'), true, 'but not the one that runs');
  finish();
  await until('Receipt’s build ends again', async () => !(await listed('pd')));

  await waitsOn('pg');
  await open('one');
  fs.rmSync(boardFile('pg'));
  await until('Basket’s file goes outside Fenmyr', () =>
    page.evaluate(
      () => ![...document.querySelectorAll('.board-row')].some(r => r.querySelector('span')?.textContent === 'Basket'),
    ),
  );
  finish();
  await until('its turn comes and it is dropped', async () => !(await listed('pg')));
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD STOP OK');
} finally {
  for (const kind of ['ask', 'build'] as const) {
    const pid = standIn.pid(kind);
    if (pid && alive(pid)) process.kill(pid);
  }
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
