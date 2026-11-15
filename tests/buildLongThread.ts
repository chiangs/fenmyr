// A build on a prototype whose thread is as long as it gets (125 builds, 500 lines) costs the window about what it does
// on a short one: asking for it, its landing and Undo this build restyle about as many elements on both, since only
// the lines whose buttons change are drawn again and nothing restyles every one of her lines. While the block grows,
// the thread stays at the bottom when it was there, and where the person scrolled to when they had scrolled up.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { CDPSession } from 'playwright';
import type { FileDiff } from '../src/shared/build.ts';
import type { ChatMsg } from '../src/shared/chat.ts';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-long-');
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const l = await launch({ boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const { page } = l;
const standIn = buildStandIn(l);

// builds of two files each, every one with her line, Undo this build, Commit and next steps
const thread = (board: string, builds: number) =>
  Array.from({ length: builds }, (_, i): ChatMsg[] => {
    const t = 1_700_000_000_000 + i * 60_000,
      build = `b${i}`,
      snapshot = i.toString(16).padStart(40, 'a'),
      request = `Make change number ${i} to the checkout.`;
    const files: FileDiff[] = [
      { kind: 'text', path: 'src/App.tsx', added: 3, removed: 1 },
      { kind: 'text', path: `src/Part${i}.tsx`, added: 24, removed: 0 },
    ];
    return [
      { who: 'me', text: request, t },
      { who: 'myra', text: 'Writing it now.', t: t + 1 },
      {
        who: 'myra',
        text: '',
        t: t + 2,
        acts: [
          {
            kind: 'build',
            board,
            build,
            request,
            cards: 3,
            start: { at: t + 2, snapshot },
            end: { kind: 'built', at: t + 40_000, files, outside: [], from: [] },
          },
        ],
      },
      {
        who: 'myra',
        text: `I made change ${i}.`,
        t: t + 40_000,
        acts: [
          { kind: 'buildUndo', board, snapshot, build },
          { kind: 'commit', board, message: `Change ${i}`, build },
          { kind: 'next', text: 'Add a coupon field' },
        ],
      },
    ];
  }).flat();

const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await page.frameLocator('#pr-preview iframe').locator('h1').waitFor({ timeout: 30000 });
  await settle(page, 800);
};
// the words of each line, without its block or buttons
const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean>, what: string, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what}: ${JSON.stringify((await texts()).slice(-4))}`);
};
const lastHead = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .m-summary.build b')].at(-1)?.textContent ?? '');
const fileLines = () =>
  page.evaluate(
    () => [...document.querySelectorAll('#mcList .mc-msg.bare')].at(-1)?.querySelectorAll('li').length ?? 0,
  );

const isEvent = (x: unknown): x is { name: string; args?: { elementCount?: number } } =>
  typeof x === 'object' && x !== null && 'name' in x && typeof x.name === 'string';

// how many elements the renderer restyled while `act` ran and the window settled after it, from the trace's style
// recalculations, which count them
async function restyled(cdp: CDPSession, act: () => Promise<unknown>) {
  const events: unknown[] = [];
  const collect = (e: { value: unknown[] }) => events.push(...e.value);
  cdp.on('Tracing.dataCollected', collect);
  await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
  await act();
  await page.waitForTimeout(600);
  const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await complete;
  cdp.off('Tracing.dataCollected', collect);
  return events
    .filter(isEvent)
    .filter(e => e.name === 'UpdateLayoutTree')
    .reduce((n, e) => n + (e.args?.elementCount ?? 0), 0);
}

// asking for a build of three files to her line, then Undo this build to the block saying so
async function costs(cdp: CDPSession, board: string) {
  await open(board);
  standIn.next({ files: { 'src/a.tsx': 'a\n', 'src/b.tsx': 'b\n', 'src/c.tsx': 'c\n' }, reply: `Three on ${board}.` });
  const build = await restyled(cdp, async () => {
    await page.evaluate(
      request => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request } }, request),
      `Three files on ${board}.`,
    );
    await until(async () => (await texts()).includes(`Three on ${board}.`), 'her line lands');
  });
  await settle(page, 600);
  const undo = await restyled(cdp, async () => {
    await page.locator('#mcList button', { hasText: 'Undo this build' }).last().click();
    await until(async () => (await lastHead()).endsWith('· undone'), 'the block says it is undone');
  });
  return { build, undo };
}

try {
  await page.evaluate(
    async ({ repo, long, short }) => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
        folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
        order: {},
      });
      for (const [id, name, chat] of [
        ['long', 'Long', long],
        ['short', 'Short', short],
      ] as const) {
        const proto = await window.Fenmyr.protoCreate({ root: repo, name, stack: 'react' });
        await window.Fenmyr.save({
          id,
          name,
          folder: 'pf',
          kind: 'prototype',
          proto: { ...proto, build: `b${chat.length / 4 - 1}` },
          cards: [],
          links: [],
          tray: [],
          chat,
        });
      }
      await window.__fenmyr.refreshBoards();
    },
    { repo, long: thread('long', 125), short: thread('short', 1) },
  );
  const cdp = await page.context().newCDPSession(page);

  const short = await costs(cdp, 'short'),
    long = await costs(cdp, 'long');
  console.log(`restyled: short ${JSON.stringify(short)}, long ${JSON.stringify(long)}`);
  // the long thread's own lines, drawn again or restyled once each, would add hundreds
  assert.ok(long.build < short.build + 150, `asking and landing restyle about as much on a long thread: ${long.build}`);
  assert.ok(long.undo < short.undo + 150, `Undo this build restyles about as much on a long thread: ${long.undo}`);

  standIn.next({
    files: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`src/g${i}.tsx`, `g${i}\n`])),
    pause: true,
    reply: 'Six.',
  });
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: 'Six.' } }, 'Six.'));
  const gap = () =>
    page.evaluate(() => {
      const list = document.getElementById('mcList');
      return list ? Math.round(list.scrollHeight - list.scrollTop - list.clientHeight) : -1;
    });
  for (let n = 1; n <= 3; n++) {
    await until(async () => (await fileLines()) === n + 1, `the block grows a line for file ${n}`);
    await page.waitForTimeout(100);
    assert.strictEqual(await gap(), 0, `the thread stays at the bottom as file ${n} lands`);
    standIn.release();
  }
  await page.evaluate(() => {
    const list = document.getElementById('mcList');
    if (list) list.scrollTop = 200;
  });
  // the sixth file is the last, and her line after it brings the thread to the bottom
  for (let n = 4; n <= 5; n++) {
    await until(async () => (await fileLines()) === n + 1, `the block grows a line for file ${n}`);
    await page.waitForTimeout(100);
    const top = await page.evaluate(() => document.getElementById('mcList')?.scrollTop ?? -1);
    assert.strictEqual(top, 200, `the thread stays where the person scrolled to as file ${n} lands`);
    standIn.release();
  }
  await until(async () => (await texts()).includes('Six.'), 'the six-file build lands');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD LONG THREAD OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
