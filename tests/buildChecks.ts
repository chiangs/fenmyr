// After a build, its block says whether the preview bundled and ran without errors in the 3 seconds after its frame
// loaded, and keeps it, so it reads the same after reopening the board and after a restart. A failure offers Fix the
// errors, which asks her as the person would, and she reads how the check went. The check is one write that redraws
// only the block, and a screen reader hears it.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatMsg } from '../src/shared/chat.ts';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-checks-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-checks-data-'));

const start = async () => {
  const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
  return { l, standIn: buildStandIn(l) };
};
let { l, standIn } = await start();
const page = () => l.page;

type Block = { lines: string[]; marks: string[]; buttons: string[] };
const blocks = (): Promise<Block[]> =>
  page().evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => ({
      lines: [...m.querySelectorAll('.m-summary li')].map(li => li.textContent ?? ''),
      marks: [...m.querySelectorAll('.m-summary li')].map(
        li => (li instanceof HTMLElement ? li.dataset.mark : '') ?? '',
      ),
      buttons: [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? ''),
    })),
  );
const last = async () => (await blocks()).at(-1);
const lastLine = async () => (await last())?.lines.at(-1) ?? '';
const texts = () =>
  page().evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page().waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await blocks())} ${JSON.stringify(await texts())}`);
};
const build = (request: string, files: Record<string, string>) => {
  standIn.next({ files, reply: `Done: ${request}` });
  return page().evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
};
const landed = (request: string) =>
  until(async () => (await texts()).includes(`Done: ${request}`), `the build “${request}” lands`);
const checked = (what: string) =>
  until(async () => /^(Preview runs|The preview couldn’t)/.test(await lastLine()), what);
const open = async (id: string) => {
  await page().evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page(), 400);
};
type Stored = Extract<NonNullable<ChatMsg['acts']>[number], { kind: 'build' }>;
const records = (): Stored[] =>
  (JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'pb.json'), 'utf8')).chat ?? [])
    .flatMap((m: ChatMsg) => m.acts ?? [])
    .filter((a: { kind: string }): a is Stored => a.kind === 'build');
const checkOf = (r: Stored | undefined) => (r?.end?.kind === 'built' ? r.end.check : undefined);
const heard = () => page().evaluate(() => document.querySelector('#mcStatusSay .mc-heard')?.textContent ?? '');

const CLEAN = 'export function App() { return <h1>Clean</h1>; }\n',
  TWO = "export function App() { console.error('boom-one'); console.error('boom-two'); return <h1>Two</h1>; }\n",
  THROWS = "export function App(): JSX.Element { throw new Error('boom-render'); }\n",
  BROKEN = 'export function App() { return <h1>Broken</h1>\n';

try {
  await page().evaluate(async repo => {
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
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await settle(page(), 600);

  // every line the block shows from the moment it lands, drawn or not between polls
  await page().evaluate(() => {
    const seen: string[] = [];
    Reflect.set(window, 'seen', seen);
    new MutationObserver(() => {
      const li = [...document.querySelectorAll('#mcList .mc-msg.bare .m-summary li')].at(-1);
      if (li?.textContent && seen.at(-1) !== li.textContent) seen.push(li.textContent);
    }).observe(document.getElementById('mcList') ?? document.body, { childList: true, subtree: true });
  });
  await build('Clean build.', { 'src/App.tsx': CLEAN });
  await landed('Clean build.');
  await until(async () => (await lastLine()) === 'Checking the preview', 'the block says it checks the preview');
  const seen: unknown = await page().evaluate(() => Reflect.get(window, 'seen'));
  assert(
    Array.isArray(seen) && !seen.includes('Preview not checked yet'),
    `a build that lands on the open board goes straight to checking: ${JSON.stringify(seen)}`,
  );
  // the earlier messages and their buttons are kept as they are drawn, so a redraw of the whole chat would show
  await page().evaluate(() => {
    const others = '#mcList .mc-msg:not(.bare), #mcList .mc-msg:not(.bare) button';
    for (const m of document.querySelectorAll(others)) Reflect.set(m, 'kept', true);
    const save = window.Fenmyr.save.bind(window.Fenmyr);
    Reflect.set(window, 'saves', 0);
    window.Fenmyr.save = b => {
      if (b.id === 'pb') Reflect.set(window, 'saves', Number(Reflect.get(window, 'saves')) + 1);
      return save(b);
    };
  });
  await checked('the clean build is checked');
  assert.deepStrictEqual((await last())?.buttons, [], 'a clean build offers no fix');
  assert.strictEqual(await lastLine(), 'Preview runs · no errors', 'a clean build passes');
  assert.strictEqual((await last())?.marks.at(-1), 'done', 'and its line is marked done');
  assert.deepStrictEqual(checkOf(records().at(-1)), { kind: 'ran', count: 0, errors: [] }, 'and its file keeps it');
  assert.strictEqual(await page().evaluate(() => Reflect.get(window, 'saves')), 1, 'the check is one write');
  assert(
    await page().evaluate(() =>
      [...document.querySelectorAll('#mcList .mc-msg:not(.bare), #mcList .mc-msg:not(.bare) button')].every(
        m => Reflect.get(m, 'kept') === true,
      ),
    ),
    'and it draws only the block again',
  );
  assert.strictEqual(await heard(), 'Checkout’s preview runs with no errors', 'a screen reader hears it');

  await open('one');
  await open('pb');
  assert.strictEqual(await lastLine(), 'Preview runs · no errors', 'it reads the same after reopening the board');

  await build('Two errors.', { 'src/App.tsx': TWO });
  await landed('Two errors.');
  await until(async () => (await lastLine()) === 'Checking the preview', 'it is checked in turn');
  await page().evaluate(() => Reflect.set(window, 'saves', 0));
  await checked('the build that logs errors is checked');
  assert.strictEqual(await page().evaluate(() => Reflect.get(window, 'saves')), 1, 'its two errors are one write');
  assert.strictEqual(await lastLine(), 'Preview runs · 2 errors: boom-one', 'errors are counted, the first shown');
  assert.strictEqual((await last())?.marks.at(-1), 'bad', 'and marked as gone wrong');
  assert.deepStrictEqual((await last())?.buttons, ['Fix the errors'], 'errors offer a fix');
  assert.deepStrictEqual(
    checkOf(records().at(-1)),
    { kind: 'ran', count: 2, errors: ['boom-one', 'boom-two'] },
    'and its file keeps them',
  );
  assert.strictEqual(await heard(), 'Checkout’s preview runs with 2 errors', 'a screen reader hears them');

  standIn.answer({ say: 'I’ll look at them.' }, 1500);
  await page().locator('#mcList .mc-msg.bare button', { hasText: 'Fix the errors' }).last().click();
  await until(
    async () => (await texts()).includes('Fix the errors in the preview'),
    'Fix the errors is sent as the person’s message',
  );
  assert.deepStrictEqual((await last())?.buttons, [], 'and goes while she answers, so it can’t be sent twice');
  const mine = await page().evaluate(
    () => [...document.querySelectorAll('#mcList .mc-msg.me')].at(-1)?.firstChild?.textContent ?? '',
  );
  assert.strictEqual(mine, 'Fix the errors in the preview', 'as the person’s own message');
  await until(() => standIn.asks().length > 0, 'and she is asked');
  const asked = standIn.asks().at(-1) ?? '';
  assert(asked.includes('Fix the errors in the preview'), 'she is asked to fix the errors');
  assert(asked.includes('Preview runs · 2 errors: boom-one'), `and she reads how the check went: ${asked.slice(-600)}`);
  await until(async () => (await texts()).includes('I’ll look at them.'), 'she answers');
  assert.deepStrictEqual((await last())?.buttons, ['Fix the errors'], 'and the button is back with the record');

  await build('Throws.', { 'src/App.tsx': THROWS });
  await landed('Throws.');
  await checked('a build whose component throws is checked');
  assert.match(await lastLine(), /^Preview runs · 1 error: .*boom-render/, 'a component that throws reads as an error');
  assert.deepStrictEqual((await last())?.buttons, ['Fix the errors'], 'and offers a fix');
  const older = (await blocks()).at(-2);
  assert.deepStrictEqual(older?.buttons, [], 'an older build no longer offers it');

  await build('Broken.', { 'src/App.tsx': BROKEN });
  await landed('Broken.');
  await checked('a build the bundler refuses is checked');
  assert.match(await lastLine(), /^The preview couldn’t be built: \S/, 'a build the bundler refuses says so');
  assert.deepStrictEqual((await last())?.buttons, ['Fix the errors'], 'and offers a fix');
  assert.strictEqual(checkOf(records().at(-1))?.kind, 'unbuilt', 'and its file keeps it');
  assert.strictEqual(await heard(), 'Checkout’s preview couldn’t be built', 'a screen reader hears it');

  await l.close();
  ({ l, standIn } = await start());
  await open('pb');
  const after = await blocks();
  assert.match(
    after.at(-1)?.lines.at(-1) ?? '',
    /^The preview couldn’t be built: /,
    'it reads the same after a restart',
  );
  assert.deepStrictEqual(after.at(-1)?.buttons, ['Fix the errors'], 'with its fix');
  assert.strictEqual(after[0]?.lines.at(-1), 'Preview runs · no errors', 'and so does the first build');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD CHECKS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
