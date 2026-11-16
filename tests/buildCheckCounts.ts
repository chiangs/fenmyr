// What a preview check counts: every error its render logs by 3 s after the frame's scripts ran and none after, however
// much else the preview logs, with the first error on the block's line cut at 120 characters and an Error named by its
// kind and message.
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

const { work, repo } = freshRepo('fenmyr-build-check-counts-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-check-counts-data-'));
const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

const lastLine = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.bare .m-summary li')].at(-1)?.textContent ?? '');
const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${await lastLine()} ${JSON.stringify(await texts())}`);
};
type Stored = Extract<NonNullable<ChatMsg['acts']>[number], { kind: 'build' }>;
const checkOf = (request: string) => {
  const r = (JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'pb.json'), 'utf8')).chat ?? [])
    .flatMap((m: ChatMsg) => m.acts ?? [])
    .find((a: Stored) => a.kind === 'build' && a.request === request);
  return r?.end?.kind === 'built' ? r.end.check : undefined;
};
// builds code and waits until its check is kept, giving the block's line and the kept check
const checked = async (request: string, app: string) => {
  standIn.next({ files: { 'src/App.tsx': app }, reply: `Done: ${request}` });
  await page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
  await until(async () => (await texts()).includes(`Done: ${request}`), `the build “${request}” lands`);
  await until(async () => /^Preview runs/.test(await lastLine()), `the build “${request}” is checked`);
  return { line: await lastLine(), check: checkOf(request) };
};
const app = (top: string) => `${top}\nexport function App() { return <h1>App</h1>; }\n`;

const LONG = `L${'o'.repeat(299)}`;

try {
  await page.evaluate(async repo => {
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
  await settle(page, 600);

  const many = await checked(
    'Many.',
    app(
      [
        `console.error('${LONG}');`,
        "console.error(new TypeError('typed-boom'));",
        "console.error('third');",
        "console.error('fourth');",
        "setTimeout(() => console.error('in-time'), 2000);",
        "setTimeout(() => console.error('too-late'), 4500);",
      ].join('\n'),
    ),
  );
  assert.strictEqual(
    many.line,
    `Preview runs · 5 errors: L${'o'.repeat(118)}…`,
    'every error by 3 s is counted, none after, and the first is cut at 120 characters',
  );
  assert.deepStrictEqual(
    many.check,
    { kind: 'ran', count: 5, errors: [LONG.slice(0, 200), 'TypeError: typed-boom', 'third'] },
    'the file keeps the true count and the first three, and an Error reads as its kind and message',
  );

  const chatty = await checked(
    'Chatty.',
    app("console.error('first-real');\nlet n = 0;\nsetInterval(() => console.log('chatter-' + n++), 2);"),
  );
  assert.strictEqual(chatty.line, 'Preview runs · 1 error: first-real', 'a preview that logs a lot keeps its error');
  assert.deepStrictEqual(chatty.check, { kind: 'ran', count: 1, errors: ['first-real'] }, 'and its file keeps it');

  const flood = await checked('Flood.', app("let n = 0;\nsetInterval(() => console.error('e-' + n++), 2);"));
  const count = flood.check?.kind === 'ran' ? flood.check.count : 0;
  assert(count > 200, `a flood of errors is counted past the log's 200 lines (${count})`);
  assert.strictEqual(flood.line, `Preview runs · ${count} errors: e-0`, 'from the first');
  assert.deepStrictEqual(flood.check, { kind: 'ran', count, errors: ['e-0', 'e-1', 'e-2'] }, 'and its file keeps them');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD CHECK COUNTS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
