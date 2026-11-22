// The changes counter in the docked chat's header: after a two-file build it reads "2 changes", where the git bar
// counts what isn't committed. A click unfolds a folded code column on the first changed file, with focus on its tab,
// and each changed file carries a dot; from the keyboard too. It stays after a Commit, hides during the next build and
// after Undo this build, and none of this draws the chat again.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { rect, still } from './support/settled.ts';

const { work, repo } = freshRepo('fenmyr-dock-changes-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args]).toString();
git('config', 'user.name', 'Ann Lee');
git('config', 'user.email', 'ann@example.com');
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-dock-changes-data-'));
// with motion on, so the code column slides open and the pane is fitted to the width it ends at
const l = await launch({
  data,
  boards: [replyBoard('one', 'One')],
  open: 'one',
  claude: true,
  settings: { motion: true },
});
const { page } = l;
const standIn = buildStandIn(l);
// The lag knob also delays style changes that have no transition. The app ends a column's slide with a timer set to its
// 240 ms and sizes the pane when that timer fires, so a delay on the column would put the timer ahead of the slide.
const CHANGES_AT_ONCE = '.pr-pane';
if (process.env.FENMYR_MOTION_DELAY)
  await page.addStyleTag({ content: `${CHANGES_AT_ONCE} { transition-delay: 0s !important; }` });

const head = () =>
  page.evaluate(() => {
    const c = document.getElementById('mcChanges'),
      pane = document.getElementById('pr-code');
    return {
      counter: c?.checkVisibility() ? (c.textContent ?? '') : null,
      name: c?.ariaLabel ?? '',
      tip: c?.title ?? '',
      git: document.querySelector('#prGit .pg-state span')?.textContent ?? '',
      dots: [...(pane?.querySelectorAll<HTMLElement>('.pc-file[data-changed]') ?? [])].map(f => f.dataset.file),
      caption: !!pane?.querySelector<HTMLElement>('.pc-dots')?.checkVisibility(),
      shown: pane?.querySelector<HTMLElement>('.pc-file.on')?.dataset.file ?? '',
      folded: !!pane?.closest('.folded'),
      menu: [...document.querySelectorAll<HTMLElement>('.pc-menu [data-changed]')].map(f => f.dataset.file),
      tabs: !pane?.classList.contains('pc-many'),
      pick: !!pane?.querySelector('.pc-pick[data-changed]'),
      described: pane?.querySelector('.pc-file[data-changed]')?.getAttribute('aria-description') ?? '',
      focused: document.activeElement instanceof HTMLElement ? (document.activeElement.dataset.file ?? '') : '',
      focusIn: document.activeElement?.closest('.pc-menu')
        ? 'menu'
        : document.activeElement?.closest('.pc-files')
          ? 'tabs'
          : '',
    };
  });
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
  }
  assert.fail(`${what}: ${JSON.stringify(await head())}`);
};
const has = (text: string) => page.evaluate(t => document.getElementById('mcList')?.textContent?.includes(t), text);
const build = (request: string, files: Record<string, string>, hold = false) => {
  standIn.next({ files, reply: `Done: ${request}`, hold });
  return page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
};
const landed = async (request: string) => {
  await until(async () => !!(await has(`Done: ${request}`)), `the build “${request}” lands`);
  await still(page);
};
const tapUnder = (text: string, label: string) =>
  page.locator('#mcList .mc-msg.myra', { hasText: text }).locator('.m-acts button', { hasText: label }).click();
const foldCode = async () => {
  await page.click('[data-fold="code"]');
  await until(async () => (await head()).folded, 'the code column folds');
  await still(page);
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
  await until(async () => (await head()).git !== '', 'the git bar reads the repo');
  await still(page);
  assert.strictEqual((await head()).counter, null, 'before the first build there is no counter');

  await build(
    'Make the form.',
    {
      'src/Form.tsx': 'export function Form() { return <form />; }\n',
      'src/App.tsx': 'import { Form } from "./Form";\nexport function App() { return <Form />; }\n',
    },
    true,
  );
  await until(() => standIn.wrote() === 2, 'the first build writes');
  const asked = page.locator('#mcList .mc-msg.myra', { hasText: 'Writing it now.' });
  await asked.evaluate(m => Object.assign(m, { kept: true }));
  standIn.release();
  await landed('Make the form.');
  await until(async () => /not committed/.test((await head()).git), 'the git bar catches up');
  let h = await head();
  assert.strictEqual(h.counter, '2 changes', 'after a two-file build the header reads “2 changes”');
  assert.strictEqual(h.git, '2 files not committed', 'while the git bar counts what isn’t committed');
  assert.strictEqual(h.tip, 'What the last build changed', 'its tooltip says what it counts');
  assert.strictEqual(h.name, '2 changes in the last build', 'and so does the name a screen reader hears');
  assert.deepStrictEqual(h.dots.sort(), ['src/App.tsx', 'src/Form.tsx'], 'both changed files carry the dot');
  assert.ok(h.caption, 'with the caption that says what the dots mean');
  assert.strictEqual(h.described, 'Changed by the last build', 'and a screen reader hears what a dot means');
  assert.ok(
    await asked.evaluate(m => Reflect.get(m, 'kept') === true),
    'the counter came without drawing the chat again',
  );

  await page.evaluate(() => window.__fenmyr.openBoard('one'));
  await still(page);
  assert.strictEqual((await head()).counter, null, 'an ordinary board’s chat has no counter');
  await page.evaluate(() => window.__fenmyr.openBoard('pb'));
  await until(async () => (await head()).dots.length === 2, 'the code pane draws the changed files');
  await still(page);
  assert.ok(!(await head()).tabs, 'at the code column’s first width its files don’t fit as tabs');
  await foldCode();
  await page.click('#mcChanges');
  await until(async () => (await head()).focused === 'src/App.tsx', 'focus lands on the first changed file');
  h = await head();
  assert.ok(!h.folded, 'a click unfolds the folded code column');
  assert.strictEqual(h.shown, 'src/App.tsx', 'on the first changed file the pane lists');
  assert.strictEqual(h.focusIn, 'menu', 'and, since the tabs don’t fit, in the file picker’s menu');
  assert.deepStrictEqual(h.menu.sort(), ['src/App.tsx', 'src/Form.tsx'], 'where both changed files carry the dot');
  assert.ok(h.pick, 'as does the picker, which shows a changed file');
  await page.keyboard.press('Escape');

  const d = await rect(page, '.pr-div[data-d="code"]');
  assert.ok(d.width > 0, 'the code column has a divider');
  await page.mouse.move(d.x + d.width / 2, d.y + 200);
  await page.mouse.down();
  await page.mouse.move(d.x - 300, d.y + 200, { steps: 4 });
  await page.mouse.up();
  await until(async () => (await head()).tabs, 'a wider code column shows its files as tabs');
  await page.click('.pc-file:not([data-changed])');
  await until(async () => (await head()).shown !== 'src/App.tsx', 'another file shows');
  await foldCode();
  await page.focus('#mcChanges');
  await page.keyboard.press('Enter');
  await until(async () => (await head()).focused === 'src/App.tsx', 'Enter on the counter opens the code on it too');
  h = await head();
  assert.ok(!h.folded, 'from the keyboard the column unfolds as well');
  assert.strictEqual(h.shown, 'src/App.tsx', 'back on the first changed file');
  assert.strictEqual(h.focusIn, 'tabs', 'with focus on its tab, since the tabs fit');
  assert.deepStrictEqual(h.dots.sort(), ['src/App.tsx', 'src/Form.tsx'], 'and both tabs carry the dot');

  await foldCode();
  // the second click lands a frame into the column's slide, as an impatient double click does
  await page.evaluate(async () => {
    const counter = document.getElementById('mcChanges');
    const sliding = () =>
      document.getAnimations().some(a => {
        const timing = a.effect?.getComputedTiming();
        return !!timing && Number.isFinite(timing.endTime) && Number(timing.localTime) > (timing.delay ?? 0);
      });
    counter?.click();
    for (let frame = 0; frame < 120 && !sliding(); frame++) await new Promise(r => requestAnimationFrame(r));
    counter?.click();
  });
  await until(async () => (await head()).focusIn === 'tabs', 'a double click lands on the tab too');
  await still(page);
  assert.ok(!(await page.$('.pc-menu')), 'with no picker left open from the second click');

  await tapUnder('Done: Make the form.', 'Commit');
  await until(async () => !!(await has('Message: “Make the form”')), 'Commit asks first');
  await page.locator('#mcList .m-acts button', { hasText: 'Commit' }).last().click();
  await until(async () => (await head()).git === 'Everything committed', 'the commit lands');
  assert.strictEqual((await head()).counter, '2 changes', 'after a Commit it still reads “2 changes”');

  await build('Change the words.', { 'src/App.tsx': 'export function App() { return <p>Hi</p>; }\n' }, true);
  await until(() => standIn.wrote() === 1, 'the next build writes');
  h = await head();
  assert.strictEqual(h.counter, null, 'during the next build it is hidden');
  assert.deepStrictEqual(h.dots, [], 'and the code pane shows no dots');
  standIn.release();
  await landed('Change the words.');
  await until(async () => (await head()).counter === '1 change', 'that build counts its one file');
  assert.strictEqual((await head()).counter, '1 change', 'once that build lands it counts its one file');

  await tapUnder('Done: Change the words.', 'Undo this build');
  await until(async () => (await head()).counter === null, 'after Undo this build it is hidden');
  await until(async () => (await head()).dots.length === 0, 'and the dots go with it');
  assert.match(
    fs.readFileSync(path.join(repo, dir, 'src/App.tsx'), 'utf8'),
    /Form/,
    'Undo put the build’s file back, so nothing the counter could count is left',
  );

  await build('Say hi.', { 'src/App.tsx': 'export function App() { return <p>Hi</p>; }\n' });
  await landed('Say hi.');
  await until(async () => (await head()).counter === '1 change', 'a build after the Undo is counted');
  assert.strictEqual((await head()).counter, '1 change', 'a build after the Undo is counted');
  await page.evaluate(() => document.getElementById('clearChats')?.click());
  await until(async () => (await head()).counter === null, 'Clear all chats takes the build it counted');
  assert.deepStrictEqual((await head()).dots, [], 'and its dots');
  assert.deepStrictEqual(l.errors, []);
  console.log('DOCK CHANGES OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
