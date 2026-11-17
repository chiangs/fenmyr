// What the changes counter counts and what the code pane marks: a build that changed nothing hides it, even though the
// build before it changed files; a failed build counts what it changed; a request that never started leaves the build
// before it counted. Files the pane hides get a dot only once All files shows them, and a deleted file counts with no
// dot. When no changed file is listed, a click opens the pane with focus on the file it shows and no menu.
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

const { work, repo } = freshRepo('fenmyr-dock-changes-which-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-dock-changes-which-data-'));
const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const { page } = l;
const standIn = buildStandIn(l);

const head = () =>
  page.evaluate(() => {
    const c = document.getElementById('mcChanges'),
      pane = document.getElementById('pr-code'),
      at = document.activeElement;
    return {
      counter: c?.checkVisibility() ? (c.textContent ?? '') : null,
      dots: [...(pane?.querySelectorAll<HTMLElement>('.pc-file[data-changed]') ?? [])].map(f => f.dataset.file).sort(),
      caption: !!pane?.querySelector<HTMLElement>('.pc-dots')?.checkVisibility(),
      menu: !!document.querySelector('.pc-menu'),
      many: !!pane?.classList.contains('pc-many'),
      focused: at instanceof HTMLElement && pane?.contains(at) ? (at.dataset.file ?? at.className) : '',
    };
  });
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(100);
  }
  assert.fail(`${what}: ${JSON.stringify(await head())}`);
};
const build = async (request: string, files: Record<string, string>, fail?: string) => {
  standIn.next({ files, reply: `Done: ${request}`, ...(fail ? { fail } : {}) });
  await page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
  const said = fail ? `I couldn’t finish that. ${fail}` : `Done: ${request}`;
  await until(
    () => page.evaluate(t => !!document.getElementById('mcList')?.textContent?.includes(t), said),
    `the build “${request}” lands`,
  );
  await settle(page, 600);
};
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 800);
};
type Kept = Extract<NonNullable<ChatMsg['acts']>[number], { kind: 'build' }>;
const record = (build: string, extra: Partial<Kept>): ChatMsg => ({
  who: 'myra',
  text: '',
  t: 1,
  acts: [{ kind: 'build', board: 'pb', build, request: build, cards: 0, ...extra }],
});
const START = { at: 1, snapshot: 'a'.repeat(40) };
const text = (path: string) => ({ kind: 'text' as const, path, added: 1, removed: 0 });
// the prototype as it is after the builds `chat` keeps, with `newest` as its newest build
const seed = async (chat: ChatMsg[], newest: string) => {
  await open('one');
  await page.evaluate(
    async ({ chat, newest }) => {
      const b = await window.Fenmyr.load('pb');
      if (b?.kind === 'prototype') await window.Fenmyr.save({ ...b, chat, proto: { ...b.proto, build: newest } });
    },
    { chat, newest },
  );
  await open('pb');
};

try {
  const dir = await page.evaluate(async repo => {
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
  await settle(page, 1500);

  const app = 'export function App() { return <h1>One</h1>; }\n';
  await build('Say one.', { 'src/App.tsx': app });
  assert.strictEqual((await head()).counter, '1 change', 'a build that changed a file is counted');
  await build('Say one again.', { 'src/App.tsx': app });
  let h = await head();
  assert.strictEqual(
    h.counter,
    null,
    'a build that changed nothing hides the counter, though the one before changed a file',
  );
  assert.deepStrictEqual(h.dots, [], 'and the code pane marks nothing');
  await build('Add the form.', { 'src/Form.tsx': 'export const Form = () => <form />;\n' }, 'Claude Code stopped.');
  h = await head();
  assert.strictEqual(h.counter, '1 change', 'a failed build counts the files it changed');
  assert.deepStrictEqual(h.dots, ['src/Form.tsx'], 'and marks them');
  assert.ok(fs.existsSync(path.join(repo, dir, 'src/Form.tsx')), 'the failed build left its file');

  await seed(
    [
      record('b1', {
        start: START,
        end: { kind: 'built', at: 2, files: [text('src/App.tsx')], outside: [], from: [] },
      }),
      record('b2', {}),
      record('b3', { end: { kind: 'failed', at: 3, files: [] } }),
    ],
    'b1',
  );
  assert.strictEqual(
    (await head()).counter,
    '1 change',
    'a request that never started, or couldn’t start, leaves the build before it counted',
  );

  await seed(
    [
      record('b4', {
        start: START,
        end: {
          kind: 'built',
          at: 2,
          files: [text('src/App.tsx'), text('index.html'), text('src/Gone.tsx'), text('src/tweaks.json')],
          outside: [],
          from: [],
        },
      }),
    ],
    'b4',
  );
  h = await head();
  assert.strictEqual(h.counter, '4 changes', 'hidden files and a deleted one all count');
  assert.deepStrictEqual(
    h.dots,
    [':values', 'src/App.tsx'],
    'but only listed files carry a dot, Values standing for the controls’ tweaks.json',
  );
  await page.click('.pc-all');
  await until(async () => (await head()).dots.length === 4, 'All files lists the wiring');
  assert.deepStrictEqual(
    (await head()).dots,
    [':values', 'index.html', 'src/App.tsx', 'src/tweaks.json'],
    'where the changed wiring carries a dot',
  );
  await page.click('.pc-all');
  await until(async () => (await head()).dots.length === 2, 'Fewer files hides the wiring again');

  await seed(
    [
      record('b5', {
        start: START,
        end: { kind: 'built', at: 2, files: [text('index.html'), text('src/Gone.tsx')], outside: [], from: [] },
      }),
    ],
    'b5',
  );
  h = await head();
  assert.strictEqual(h.counter, '2 changes', 'a build that changed only hidden and deleted files is counted');
  assert.ok(!h.caption, 'with no dot listed there is no caption');
  assert.ok(h.many, 'the pane shows its picker, since the tabs don’t fit');
  await page.click('#mcChanges');
  await until(async () => (await head()).focused !== '', 'focus moves into the code pane');
  h = await head();
  assert.ok(!h.menu, 'no file picker opens with nothing marked in it');
  assert.match(
    h.focused,
    /^src\/App\.tsx$|pc-pick/,
    'focus is on the file the pane shows, or the picker that shows it',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('DOCK CHANGES WHICH OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
