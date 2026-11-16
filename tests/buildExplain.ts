// Explain the code under the newest build: one press adds the person's line, says "Reading the code" with no typing
// dots, and runs Claude Code able only to read, in the prototype's folder and told the build's files. Her answer lands in
// the prototype's chat even when another board is open by then, with file names in code font. The button goes while
// she reads and is spent once her answer lands, so a press cut off by a quit or a reload is offered again, and it doesn't
// come back after a restart once spent. A newer build takes it from the one before. A failure lands in her words,
// drawing only the new line, a screen reader hears it, and it carries the button to try again until the build is undone.
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

const { work, repo } = freshRepo('fenmyr-build-explain-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-explain-data-'));

const start = async () => {
  const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
  return { l, standIn: buildStandIn(l) };
};
let { l, standIn } = await start();
const page = () => l.page;

const EXPLAIN = 'Explain the code';
// A last line that reads like the NEXT: of a build's reply stays hers, and a file name stays as it is spelt, where the
// window says a Mac's words in Linux's.
const ANSWER =
  'I split it in two: `src/App.tsx` shows `src/Form.tsx` and `src/Terminal.tsx`.\nNext: change the words in `src/Form.tsx`.';
const texts = () =>
  page().evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg')].map(m =>
      [...m.childNodes]
        .filter(n => !(n instanceof HTMLElement && n.classList.contains('m-parts')))
        .map(n => n.textContent ?? '')
        .join(''),
    ),
  );
const buttonsUnder = (text: string) =>
  page().evaluate(
    text =>
      [...document.querySelectorAll('#mcList .mc-msg.myra')]
        .filter(m => m.firstChild?.textContent === text)
        .map(m => [...m.querySelectorAll('.m-acts button')].map(b => b.textContent ?? '')),
    text,
  );
const status = () =>
  page().evaluate(() => ({
    say: document.querySelector('#mcStatusSay')?.firstChild?.textContent ?? '',
    heard: document.querySelector('#mcStatusSay .mc-heard')?.textContent ?? '',
    dots: !!document.querySelector('#mcList > .typing'),
  }));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page().waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await texts())} ${JSON.stringify(await status())}`);
};
const build = async (request: string, files: Record<string, string>) => {
  standIn.next({ files, reply: `Done: ${request}` });
  await page().evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
  await until(async () => (await texts()).includes(`Done: ${request}`), `the build “${request}” lands`);
};
const open = async (id: string) => {
  await page().evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page(), 400);
};
const restart = async () => {
  await l.close();
  ({ l, standIn } = await start());
  await open('pb');
};
const tapUnder = (text: string, label: string) =>
  page().locator('#mcList .mc-msg.myra', { hasText: text }).getByRole('button', { name: label, exact: true }).click();
const stored = (): ChatMsg[] =>
  JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'pb.json'), 'utf8')).chat ?? [];

try {
  const dir = await page().evaluate(async repo => {
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
    return proto.dir;
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  await settle(page(), 600);

  await build('First.', { 'src/App.tsx': 'export function App() { return <h1>One</h1>; }\n' });
  assert.deepStrictEqual(
    await buttonsUnder('Done: First.'),
    [['Undo this build', EXPLAIN, 'Commit']],
    'Explain the code sits between Undo this build and Commit under her explanation',
  );
  await build('Second.', {
    'src/App.tsx': 'import { Form } from "./Form";\nexport function App() { return <Form />; }\n',
    'src/Form.tsx': 'export function Form() { return <form />; }\n',
  });
  assert.deepStrictEqual(await buttonsUnder('Done: First.'), [[]], 'after a newer build, the one before has none');
  assert.deepStrictEqual(await buttonsUnder('Done: Second.'), [['Undo this build', EXPLAIN, 'Commit']]);

  await restart();
  assert.deepStrictEqual(
    await buttonsUnder('Done: Second.'),
    [['Undo this build', EXPLAIN, 'Commit']],
    'it comes back after a restart until it is pressed',
  );

  // a press cut off by a quit, then by a reload, before her answer lands
  standIn.explain({ reply: ANSWER, hold: true });
  const asked = (n: number) => () => stored().filter(m => m.who === 'me' && m.text === EXPLAIN).length === n;
  await tapUnder('Done: Second.', EXPLAIN);
  await until(asked(1), 'the person’s line is saved');
  await restart();
  assert.deepStrictEqual(
    await buttonsUnder('Done: Second.'),
    [['Undo this build', EXPLAIN, 'Commit']],
    'a press cut off by a quit is offered again',
  );
  await tapUnder('Done: Second.', EXPLAIN);
  await until(asked(2), 'pressed again, and saved');
  await page().reload();
  await page().waitForFunction(() => !!window.__fenmyr?.curBoard());
  await open('pb');
  assert.deepStrictEqual(
    await buttonsUnder('Done: Second.'),
    [['Undo this build', EXPLAIN, 'Commit']],
    'and one cut off by a reload',
  );

  await tapUnder('Done: Second.', EXPLAIN);
  assert.strictEqual(
    await page().evaluate(() => {
      const f = document.activeElement;
      return f?.classList.contains('mc-msg') ? f.firstChild?.textContent : f?.tagName;
    }),
    EXPLAIN,
    'focus moves to the person’s line, since the pressed button goes',
  );
  await until(async () => (await texts()).at(-1) === EXPLAIN, 'pressing it adds the person’s line');
  await until(async () => (await status()).say === 'Reading the code', 'the status line says she reads the code');
  assert.strictEqual((await status()).dots, false, 'with no typing dots, since the answer may land elsewhere');
  assert.deepStrictEqual(
    await buttonsUnder('Done: Second.'),
    [['Undo this build', 'Commit']],
    'it goes while she reads, so one press is one run',
  );
  const spent = () => {
    const acts = stored().flatMap(m => m.acts ?? []),
      second = acts.findLast(a => a.kind === 'build')?.build;
    return !!second && !acts.some(a => a.kind === 'explain' && a.build === second);
  };

  // the runs cut off by the quit and the reload asked first
  await until(() => standIn.explains().length === 3, 'Claude Code is asked');
  const run = standIn.explains().at(-1);
  const args = run?.args ?? [],
    after = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  assert.strictEqual(after('--allowedTools'), 'Read,Glob,Grep', `it may only read: ${args.join(' ')}`);
  assert.strictEqual(after('--tools'), 'Read,Glob,Grep', 'its tools are the reading ones alone');
  assert(!args.includes('acceptEdits'), 'and it accepts no edits');
  assert.strictEqual(run?.cwd, path.join(repo, dir), 'it runs in the prototype’s folder');
  assert.match(
    run?.prompt ?? '',
    /THE FILES THE LAST BUILD CHANGED:\nsrc\/App\.tsx\nsrc\/Form\.tsx/,
    'told the build’s files',
  );

  await open('one');
  standIn.explained();
  await until(
    () => stored().at(-1)?.text === ANSWER,
    'her answer lands in the prototype’s chat while another board is open',
  );
  assert.strictEqual(stored().at(-2)?.text, EXPLAIN, 'after the person’s line');
  assert(spent(), 'and once it lands, its board file no longer offers Explain the code');
  await until(async () => (await status()).say === 'Checkout’s code is explained', 'the other board hears it landed');

  await open('pb');
  assert.strictEqual(
    (await texts()).at(-1),
    'I split it in two: src/App.tsx shows src/Form.tsx and src/Terminal.tsx.\nNext: change the words in src/Form.tsx.',
    'her answer shows when the prototype opens again',
  );
  assert.deepStrictEqual(
    await page().evaluate(() =>
      [...([...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.querySelectorAll('code') ?? [])].map(
        c => c.textContent,
      ),
    ),
    ['src/App.tsx', 'src/Form.tsx', 'src/Terminal.tsx', 'src/Form.tsx'],
    'with its file names in code font',
  );
  assert(
    await page().evaluate(() => {
      const code = [...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.querySelector('code'),
        before = code?.previousSibling;
      if (!code || !before) return false;
      const range = document.createRange();
      range.selectNodeContents(before);
      const end = [...range.getClientRects()].at(-1);
      return !!end && Math.abs(end.top - code.getBoundingClientRect().top) < 4;
    }),
    'set in her sentence, not on a line of its own',
  );

  await restart();
  assert.deepStrictEqual(
    await buttonsUnder('Done: Second.'),
    [['Undo this build', 'Commit']],
    'and once pressed it doesn’t come back after a restart',
  );

  await build('Third.', { 'src/App.tsx': 'export function App() { return <h1>Three</h1>; }\n' });
  await until(
    () =>
      page().evaluate(() =>
        /^Preview runs/.test(
          [...document.querySelectorAll('#mcList .mc-msg.bare .m-summary li')].at(-1)?.textContent ?? '',
        ),
      ),
    'its preview is checked',
  );
  // every line drawn now is kept as it is, so drawing the whole chat again would show
  await page().evaluate(() => {
    for (const m of document.querySelectorAll('#mcList .mc-msg, #mcList .mc-msg button')) Reflect.set(m, 'kept', true);
  });
  standIn.explain({ fail: 'Claude Code isn’t signed in.' });
  await tapUnder('Done: Third.', EXPLAIN);
  await until(
    async () => (await texts()).at(-1) === 'I couldn’t read the code just now. Claude Code isn’t signed in.',
    'a failure lands in her words',
  );
  assert(
    await page().evaluate(() =>
      [...document.querySelectorAll('#mcList .mc-msg')].slice(0, -2).every(
        m =>
          Reflect.get(m, 'kept') === true &&
          // the pressed line draws its own buttons again, less the one it spent
          (m.firstChild?.textContent === 'Done: Third.' ||
            [...m.querySelectorAll('button')].every(b => Reflect.get(b, 'kept'))),
      ),
    ),
    'and only the new lines are drawn',
  );
  await until(async () => (await status()).heard === 'Couldn’t explain Checkout’s code', 'a screen reader hears it');
  const failed = 'I couldn’t read the code just now. Claude Code isn’t signed in.';
  assert.deepStrictEqual(await buttonsUnder(failed), [[EXPLAIN]], 'and it can be tried again from her line');
  await page()
    .locator('#mcList .mc-msg.myra', { hasText: 'Done: Third.' })
    .locator('.m-acts button', { hasText: /^Commit$/ })
    .click();
  assert.deepStrictEqual(
    await buttonsUnder('Done: Third.'),
    [['Undo this build']],
    'where it was pressed, it doesn’t come back when another of the line’s buttons is pressed',
  );
  await page().getByRole('button', { name: 'Not now', exact: true }).click();
  await tapUnder('Done: Third.', 'Undo this build');
  await until(
    async () => (await texts()).includes('It’s back to how it was before that build ✦'),
    'the build is undone',
  );
  assert.deepStrictEqual(await buttonsUnder(failed), [[]], 'and once the build is undone, there is nothing to explain');
  console.log('BUILD EXPLAIN OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
