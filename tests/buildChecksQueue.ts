// A build that landed while another board was open reads "Preview not checked yet" and is checked when its board
// opens, while one that is no longer its prototype's newest is never checked. A build waiting its turn starts only once
// the build before it has been checked, so it is sent every error that check found, and says it waits for the check.
// Fix the errors pressed while another prototype builds waits its turn like any request, and is sent the errors its
// board's check kept when it starts while that board is closed.
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

const { work, repo } = freshRepo('fenmyr-build-checks-queue-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-checks-queue-data-'));
const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

type Block = { head: string; lines: string[]; marks: string[]; buttons: string[] };
const blocks = (): Promise<Block[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.bare')].map(m => ({
      head: m.querySelector('.m-summary b')?.textContent ?? '',
      lines: [...m.querySelectorAll('.m-summary li')].map(li => li.textContent ?? ''),
      marks: [...m.querySelectorAll('.m-summary li')].map(
        li => (li instanceof HTMLElement ? li.dataset.mark : '') ?? '',
      ),
      buttons: [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? ''),
    })),
  );
const lastLine = async () => (await blocks()).at(-1)?.lines.at(-1) ?? '';
const heard = () => page.evaluate(() => document.querySelector('#mcStatusSay .mc-heard')?.textContent ?? '');
const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what}: ${JSON.stringify(await blocks())} ${JSON.stringify(await texts())}`);
};
const ask = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 400);
};
type Stored = Extract<NonNullable<ChatMsg['acts']>[number], { kind: 'build' }>;
const records = (board: string): Stored[] =>
  (JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', `${board}.json`), 'utf8')).chat ?? [])
    .flatMap((m: ChatMsg) => m.acts ?? [])
    .filter((a: { kind: string }): a is Stored => a.kind === 'build');
const recordOf = (board: string, request: string) => records(board).find(r => r.request === request);
const checkOf = (r: Stored | undefined) => (r?.end?.kind === 'built' ? r.end.check : undefined);
const prototype = (id: string, name: string) =>
  page.evaluate(
    async ({ repo, id, name }) => {
      const proto = await window.Fenmyr.protoCreate({ root: repo, name, stack: 'react' });
      await window.Fenmyr.save({ id, name, folder: 'pf', kind: 'prototype', proto, cards: [], links: [], tray: [] });
    },
    { repo, id, name },
  );

const TWO = "export function App() { console.error('boom-one'); console.error('boom-two'); return <h1>Two</h1>; }\n";
const app = (words: string) => `export function App() { return <h1>${words}</h1>; }\n`;
// an error logged a second after the frame loads, which only a check that waits sees
const LATE = "setTimeout(() => console.error('late-boom'), 1000);\nexport function App() { return <h1>Late</h1>; }\n";

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
  }, repo);
  await prototype('pb', 'Checkout');
  await prototype('pc', 'Basket');
  await page.evaluate(() => window.__fenmyr.refreshBoards());
  git('add', '-A');
  git('commit', '-qm', 'start');
  await open('pb');

  standIn.next({ files: { 'src/App.tsx': app('Elsewhere') }, hold: true, reply: 'Elsewhere.' });
  await ask('Elsewhere.');
  await until(() => standIn.wrote() === 1, 'a build writes its file');
  await open('one');
  standIn.release();
  await until(() => !!recordOf('pb', 'Elsewhere.')?.end, 'it lands while another board is open');
  assert.strictEqual(checkOf(recordOf('pb', 'Elsewhere.')), undefined, 'and its file has no check');
  const first = await page.evaluate(async () => {
    await window.__fenmyr.openBoard('pb');
    const li = [...document.querySelectorAll('#mcList .mc-msg.bare .m-summary li')].at(-1);
    return { line: li?.textContent, mark: li instanceof HTMLElement ? li.dataset.mark : '' };
  });
  assert.deepStrictEqual(first, { line: 'Preview not checked yet', mark: 'wait' }, 'it reads not checked yet');
  await until(async () => (await lastLine()) === 'Preview runs · no errors', 'opening its board checks it');
  assert.deepStrictEqual(checkOf(recordOf('pb', 'Elsewhere.')), { kind: 'ran', count: 0, errors: [] }, 'and keeps it');

  standIn.next({ files: { 'src/App.tsx': app('Older') }, hold: true, reply: 'Older.' });
  await ask('Older.');
  await until(() => standIn.wrote() === 1, 'a build writes its file');
  await ask('Newer.');
  await until(async () => (await lastLine()) === 'Newer.', 'another waits behind it');
  standIn.next({ files: { 'src/App.tsx': app('Newer') }, reply: 'Newer.' });
  await open('one');
  standIn.release();
  await until(() => !!recordOf('pb', 'Newer.')?.end, 'both land while another board is open');
  await open('pb');
  await until(
    async () => (await lastLine()) === 'Preview runs · no errors',
    'the newest is checked when its board opens',
  );
  const older = (await blocks()).at(-2)?.lines ?? [];
  assert.deepStrictEqual(older.slice(1), ['src/App.tsx +1 −1'], 'the one before it says nothing of a check');
  assert.strictEqual(checkOf(recordOf('pb', 'Older.')), undefined, 'and is never checked');

  standIn.next({ files: { 'src/App.tsx': app('Overtaken') }, hold: true, reply: 'Overtaken.' });
  await ask('Overtaken.');
  await until(() => standIn.wrote() === 1, 'a build writes its file');
  await open('one');
  standIn.release();
  await until(() => !!recordOf('pb', 'Overtaken.')?.end, 'it lands while another board is open');
  standIn.next({ files: { 'src/App.tsx': app('Overtakes') }, reply: 'Overtakes.' });
  await page.evaluate(async () => {
    await window.__fenmyr.openBoard('pb');
    await window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: 'Overtakes.' } }, 'Overtakes.');
  });
  await until(() => !!checkOf(recordOf('pb', 'Overtakes.')), 'a build asked as its board opens lands and is checked');
  // the check begun on opening follows the newer build's render, so it ends about when that one's does
  await until(
    async () => JSON.stringify((await blocks()).at(-2)?.lines.slice(1)) === JSON.stringify(['src/App.tsx +1 −1']),
    'the check its board began on opening ends, and its block stops saying it is being checked',
  );
  assert.strictEqual(checkOf(recordOf('pb', 'Overtaken.')), undefined, 'and isn’t kept once a newer build has started');

  standIn.next({ files: { 'src/App.tsx': TWO }, reply: 'Switched.' });
  await ask('Switched.');
  await until(async () => (await lastLine()) === 'Checking the preview', 'a build lands and its preview is checked');
  await page.frameLocator('#pr-preview iframe').locator('h1', { hasText: 'Two' }).waitFor({ timeout: 30000 });
  await open('pc');
  await page.waitForTimeout(4000);
  assert.strictEqual(
    checkOf(recordOf('pb', 'Switched.')),
    undefined,
    'another prototype’s preview, opened during the check, doesn’t answer for it',
  );
  await open('pb');
  await until(async () => /^Preview runs · 2 errors/.test(await lastLine()), 'it is checked again on its own board');
  assert.deepStrictEqual(
    checkOf(recordOf('pb', 'Switched.')),
    { kind: 'ran', count: 2, errors: ['boom-one', 'boom-two'] },
    'and keeps its own errors',
  );

  standIn.next({ files: { 'src/App.tsx': LATE }, hold: true, reply: 'Late.' });
  await ask('Late.');
  await until(() => standIn.wrote() === 1, 'a build writes code that logs an error late');
  await ask('Behind.');
  await until(async () => (await lastLine()) === 'Behind.', 'another waits behind it');
  standIn.next({ files: { 'src/Behind.tsx': 'export const behind = 1;\n' }, reply: 'Behind, done.' });
  const ran = standIn.builds().length;
  standIn.release();
  await until(
    async () => (await blocks()).at(-1)?.head === 'Waiting for the preview check',
    'once the build before it lands, the one behind says it waits for its check',
  );
  await until(() => standIn.builds().length > ran, 'the build that waited starts');
  assert.deepStrictEqual(
    checkOf(recordOf('pb', 'Late.')),
    { kind: 'ran', count: 1, errors: ['late-boom'] },
    'only once the build before it has been checked',
  );
  assert(standIn.builds().at(-1)?.includes('late-boom'), 'and it is sent the error that check found');
  await until(async () => (await texts()).includes('Behind, done.'), 'it lands');
  await until(async () => (await lastLine()) === 'Checking the preview', 'and is being checked');
  standIn.next({ files: { 'src/During.tsx': 'export const during = 1;\n' }, reply: 'During, done.' });
  await ask('During.');
  await until(async () => (await lastLine()) === 'During.', 'another is asked during the check');
  const during = (await blocks()).at(-1);
  assert.deepStrictEqual(
    [during?.head, during?.lines.at(-1)],
    ['Waiting for the preview check', 'During.'],
    'a request asked during a check says it waits for the check',
  );
  assert.strictEqual(await heard(), 'Checkout’s build waits its turn', 'and a screen reader hears it wait');
  await until(async () => /^Preview runs · 1 error/.test(await lastLine()), 'it runs after the check, and is checked');
  assert.deepStrictEqual(
    checkOf(recordOf('pb', 'Behind.')),
    { kind: 'ran', count: 1, errors: ['late-boom'] },
    'once the check it waited for was kept',
  );

  await open('pc');
  standIn.next({ files: { 'src/App.tsx': app('Basket') }, hold: true, reply: 'Basket.' });
  await ask('Basket.');
  await until(() => standIn.wrote() === 1, 'another prototype builds');
  await open('pb');
  await until(
    async () =>
      !!(await page.evaluate(() => document.querySelector('#pr-preview .pv-log')?.textContent?.includes('late-boom'))),
    'its preview shows the error again',
  );
  standIn.answer({ say: 'I’ll fix them next.', build: { request: 'Fix the errors in the preview' } });
  standIn.next({ files: { 'src/App.tsx': app('Fixed') }, reply: 'Fixed.' });
  await page.locator('#mcList .mc-msg.bare button', { hasText: 'Fix the errors' }).last().click();
  await until(async () => (await texts()).includes('I’ll fix them next.'), 'Fix the errors during a build asks her');
  const waiting = (await blocks()).at(-1);
  assert.deepStrictEqual(
    waiting?.lines.slice(1),
    ['Fix the errors in the preview'],
    'and the build it leads to waits its turn',
  );
  assert.deepStrictEqual(waiting?.buttons, ['Cancel'], 'with Cancel');
  await open('pc');
  const before = standIn.builds().length;
  standIn.release();
  await until(() => standIn.builds().length > before, 'it runs once the other prototype’s build lands');
  const fix = standIn.builds().at(-1) ?? '';
  assert.match(
    fix.slice(fix.indexOf('ERRORS THE PREVIEW SHOWED')),
    /^ERRORS THE PREVIEW SHOWED:\nlate-boom\n/,
    'and, starting while its board is closed, is sent the errors its board’s check kept',
  );
  await until(() => !!recordOf('pb', 'Fix the errors in the preview')?.end, 'it lands on its closed board');
  await open('pb');
  await until(async () => (await lastLine()) === 'Preview runs · no errors', 'the fix is checked');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD CHECKS QUEUE OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
